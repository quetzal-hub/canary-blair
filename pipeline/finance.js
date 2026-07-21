/**
 * CANARY BLAIR — Campaign finance sync (FollowTheMoney / OpenSecrets)
 *
 * Populates the finance_* columns on members (schema 011 + 014) with the full
 * "who funds this legislator" picture: career total, top donors, industry
 * breakdown, individual-vs-organization split, and small-donor (≤$200) share.
 * Matches on the followthemoney_eid we sync from LegiScan first, then falls
 * back to name matching.
 *
 * Uses FollowTheMoney's documented "Ask Anything" API: filter contributions to
 * a candidate by their entity id (c-t-eid), read totals at
 * records[].Total_$.Total_$, and group with gro=d-eid (contributors),
 * gro=d-cci (industry+sector), gro=d-et (contributor type), plus the
 * d-amt=0,200 filter for small-dollar money. Five calls per member, throttled.
 *
 * ── SAFETY: DRY RUN BY DEFAULT ──────────────────────────────
 * This is money data attached to real, named politicians — a wrong number is
 * worse than no number. So by default this script writes NOTHING: it fetches a
 * few members, prints the raw API response and the total it extracted, and
 * stops. Confirm the number matches the FollowTheMoney entity page (and that
 * the career total is the figure you want vs. a single cycle), THEN --commit.
 *
 * Usage:
 *   FTM_API_KEY=... node pipeline/finance.js            # dry run (default): inspect a few, write nothing
 *   FTM_API_KEY=... node pipeline/finance.js --commit    # write to the database
 *   FTM_API_KEY=... node pipeline/finance.js --limit=5   # cap how many members
 *
 * Get a free API key at https://www.followthemoney.org (myFollowTheMoney account).
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';

const FTM_API_KEY = process.env.FTM_API_KEY || process.env.OPENSECRETS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : COMMIT ? Infinity : 5;

const FTM_BASE = 'https://api.followthemoney.org';

// ── Supabase helpers ─────────────────────────
async function dbFetch(path) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
		headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY }
	});
	if (!res.ok) throw new Error(`DB fetch error: ${await res.text()}`);
	return res.json();
}
async function dbPatch(id, data) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${id}`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY,
			Prefer: 'return=minimal'
		},
		body: JSON.stringify(data)
	});
	if (!res.ok) throw new Error(`Patch member ${id}: ${await res.text()}`);
}

/**
 * Extract the total-dollars figure from a FollowTheMoney "Ask Anything" JSON
 * response. Per the API docs, records carry the total at records[].Total_$.Total_$
 * (a dollar string like "5000.00"); with no grouping the response is a single
 * summary record for the filtered candidate. We sum across records defensively
 * (in case grouping ever returns several), and fall back to a deep search for a
 * total-money field if the documented shape ever changes.
 */
export function extractTotalRaised(json) {
	// Documented path: records[].Total_$.Total_$
	if (json && Array.isArray(json.records) && json.records.length) {
		let sum = 0;
		let found = false;
		for (const rec of json.records) {
			const t = rec?.['Total_$'];
			const raw = t && typeof t === 'object' ? t['Total_$'] : t;
			if (raw != null) {
				const num = Number(String(raw).replace(/[^0-9.]/g, ''));
				if (!Number.isNaN(num)) {
					sum += num;
					found = true;
				}
			}
		}
		if (found) return sum;
	}

	// Fallback: defensive deep search for any total-money field.
	let best = null;
	const totalKey = /total.*(\$|amount|raised|contrib)/i;
	const walk = (node) => {
		if (node == null) return;
		if (Array.isArray(node)) return node.forEach(walk);
		if (typeof node === 'object') {
			for (const [k, v] of Object.entries(node)) {
				if (totalKey.test(k)) {
					const num = Number(String(typeof v === 'object' ? Object.values(v)[0] : v).replace(/[^0-9.]/g, ''));
					if (!Number.isNaN(num) && num > (best || 0)) best = num;
				}
				walk(v);
			}
		}
	};
	walk(json);
	return best;
}

/**
 * Read a value out of a FollowTheMoney record tag. Tags are nested objects of
 * the shape { token, id, <TagName>: "display value" } in JSON mode.
 */
function tagValue(rec, tag) {
	const o = rec?.[tag];
	if (o == null) return null;
	return typeof o === 'object' ? (o[tag] ?? null) : o;
}

function money(raw) {
	if (raw == null) return null;
	const num = Number(String(raw).replace(/[^0-9.]/g, ''));
	return Number.isNaN(num) ? null : num;
}

/**
 * Parse a grouped Ask Anything response into rows. `fields` maps output keys
 * to record tag names, e.g. { name: 'Contributor', type: 'Type_of_Contributor' }.
 * Every row also gets total (Total_$) and records (#_of_Records). Rows are
 * returned in API order (sorted by Total_$ descending by default).
 */
export function extractGroupedRows(json, fields) {
	if (!json || !Array.isArray(json.records)) return [];
	const rows = [];
	for (const rec of json.records) {
		const row = {};
		let anyField = false;
		for (const [key, tag] of Object.entries(fields)) {
			const v = tagValue(rec, tag);
			row[key] = v;
			if (v != null) anyField = true;
		}
		if (!anyField) continue;
		row.total = money(tagValue(rec, 'Total_$'));
		row.records = Number(tagValue(rec, '#_of_Records')) || null;
		rows.push(row);
	}
	return rows;
}

// Ask Anything API: filter contributions to a candidate by their entity id
// (c-t-eid), plus optional extra params (gro=..., d-amt=..., p=...).
async function ftmQuery(eid, extra = '') {
	const url = `${FTM_BASE}/?c-t-eid=${encodeURIComponent(eid)}${extra ? `&${extra}` : ''}&APIKey=${FTM_API_KEY}&mode=json`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`FTM candidate ${eid}${extra ? ` (${extra})` : ''}: HTTP ${res.status}`);
	return { url, json: await res.json() };
}

const pause = (ms = 250) => new Promise((r) => setTimeout(r, ms)); // be polite to the API

const TOP_DONORS = 10;
const TOP_INDUSTRIES = 10;

/**
 * Fetch the full finance picture for one entity: career total, top donors,
 * industry breakdown, contributor-type split, and small-donor total (≤$200).
 * Five API calls, throttled.
 */
async function fetchFinanceDetail(eid) {
	const { json: totalJson } = await ftmQuery(eid);
	await pause();
	const { json: donorsJson } = await ftmQuery(eid, 'gro=d-eid');
	await pause();
	const { json: industriesJson } = await ftmQuery(eid, 'gro=d-cci');
	await pause();
	const { json: typesJson } = await ftmQuery(eid, 'gro=d-et');
	await pause();
	const { json: smallJson } = await ftmQuery(eid, 'd-amt=0,200');
	await pause();

	return {
		total: extractTotalRaised(totalJson),
		topDonors: extractGroupedRows(donorsJson, { name: 'Contributor', type: 'Type_of_Contributor' })
			.filter((r) => r.name != null)
			.slice(0, TOP_DONORS),
		topIndustries: extractGroupedRows(industriesJson, { industry: 'Industry', sector: 'Sector' })
			.filter((r) => r.industry != null)
			.slice(0, TOP_INDUSTRIES),
		contribTypes: extractGroupedRows(typesJson, { type: 'Type_of_Contributor' })
			.filter((r) => r.type != null),
		smallDonorTotal: extractTotalRaised(smallJson)
	};
}

function entityPageUrl(eid) {
	return `https://www.followthemoney.org/entity-details?eid=${encodeURIComponent(eid)}`;
}

async function run() {
	console.log(`💰 Finance sync — ${COMMIT ? 'COMMIT (writing to DB)' : 'DRY RUN (no writes; inspecting ' + LIMIT + ')'}\n`);

	const members = await dbFetch('members?select=id,full_name,followthemoney_eid&is_current=eq.true&order=full_name');
	const withEid = members.filter((m) => m.followthemoney_eid);
	const withoutEid = members.filter((m) => !m.followthemoney_eid);
	console.log(`${members.length} sitting members — ${withEid.length} with an FTM eid, ${withoutEid.length} without.\n`);

	let done = 0;
	let matched = 0;
	for (const m of withEid) {
		if (done >= LIMIT) break;
		done++;
		try {
			const detail = await fetchFinanceDetail(m.followthemoney_eid);

			if (!COMMIT) {
				console.log(`── ${m.full_name} (eid ${m.followthemoney_eid}) ──`);
				console.log(`  total raised:      ${detail.total == null ? 'NONE FOUND — check field mapping' : '$' + detail.total.toLocaleString()}`);
				console.log(`  small-donor ≤$200: ${detail.smallDonorTotal == null ? '—' : '$' + detail.smallDonorTotal.toLocaleString()}`);
				console.log(`  contributor types: ${detail.contribTypes.map((t) => `${t.type} $${(t.total || 0).toLocaleString()}`).join(' | ') || '—'}`);
				console.log(`  top industries:    ${detail.topIndustries.slice(0, 5).map((i) => `${i.industry} $${(i.total || 0).toLocaleString()}`).join(' | ') || '—'}`);
				console.log(`  top donors:`);
				for (const d of detail.topDonors.slice(0, 5)) {
					console.log(`     - ${d.name} (${d.type || '?'}): $${(d.total || 0).toLocaleString()}`);
				}
				console.log('  Confirm these match the FollowTheMoney entity page before --commit.\n');
			} else if (detail.total != null) {
				await dbPatch(m.id, {
					finance_total_raised: detail.total,
					finance_top_donors: detail.topDonors.length ? detail.topDonors : null,
					finance_top_industries: detail.topIndustries.length ? detail.topIndustries : null,
					finance_contrib_types: detail.contribTypes.length ? detail.contribTypes : null,
					finance_small_donor_total: detail.smallDonorTotal,
					finance_source_url: entityPageUrl(m.followthemoney_eid),
					finance_matched_by: 'eid',
					finance_updated_at: new Date().toISOString()
				});
				matched++;
				console.log(`✅ ${m.full_name}: $${detail.total.toLocaleString()} — ${detail.topDonors.length} donors, ${detail.topIndustries.length} industries`);
			} else {
				console.warn(`⚠ ${m.full_name}: no total found in response — skipped`);
			}
		} catch (err) {
			console.error(`✗ ${m.full_name}: ${err.message}`);
		}
	}

	// Name fallback: members without an eid. Name→eid resolution needs the Ask
	// Anything search API, whose exact query/response shape isn't publicly
	// documented — implement once verified against a live key. For now we surface
	// who still needs matching rather than guess at dollar figures.
	if (withoutEid.length) {
		console.log(`\n📝 ${withoutEid.length} members have no FTM eid and need name matching (not yet resolved):`);
		for (const m of withoutEid.slice(0, 20)) console.log(`   - ${m.full_name}`);
	}

	if (COMMIT) console.log(`\nDone. Wrote finance data for ${matched} members.`);
	else console.log(`\nDry run complete. If the totals above look right, run again with --commit.`);
}

// Only run when invoked directly (so extractTotalRaised can be imported by tests).
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
	if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
		console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
		process.exit(1);
	}
	if (!FTM_API_KEY) {
		console.error('Missing FTM_API_KEY (free key from https://www.followthemoney.org). Finance sync skipped.');
		process.exit(1);
	}
	run().catch((err) => {
		console.error('\n❌ Finance sync failed:', err.message);
		process.exit(1);
	});
}
