/**
 * CANARY BLAIR — Campaign finance sync (FollowTheMoney / OpenSecrets)
 *
 * Populates the finance_* columns on members (schema 011) with total campaign
 * contributions, so a profile can show "who funds this legislator" next to
 * their Canary Score. Matches on the followthemoney_eid we sync from LegiScan
 * first, then falls back to name matching.
 *
 * Uses FollowTheMoney's documented "Ask Anything" API: filter contributions to
 * a candidate by their entity id (c-t-eid) and read the total at
 * records[].Total_$.Total_$.
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

// Ask Anything API: filter contributions to a candidate by their entity id
// (c-t-eid). No grouping → one summary record with the career total.
async function fetchEntity(eid) {
	const url = `${FTM_BASE}/?c-t-eid=${encodeURIComponent(eid)}&APIKey=${FTM_API_KEY}&mode=json`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`FTM candidate ${eid}: HTTP ${res.status}`);
	return { url, json: await res.json() };
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
			const { url, json } = await fetchEntity(m.followthemoney_eid);
			const total = extractTotalRaised(json);

			if (!COMMIT) {
				console.log(`── ${m.full_name} (eid ${m.followthemoney_eid}) ──`);
				console.log(`  extracted total: ${total == null ? 'NONE FOUND — check field mapping' : '$' + total.toLocaleString()}`);
				console.log(`  raw response (confirm the total is correct):`);
				console.log(JSON.stringify(json, null, 2).slice(0, 2000));
				console.log('');
			} else if (total != null) {
				await dbPatch(m.id, {
					finance_total_raised: total,
					finance_source_url: entityPageUrl(m.followthemoney_eid),
					finance_matched_by: 'eid',
					finance_updated_at: new Date().toISOString()
				});
				matched++;
				console.log(`✅ ${m.full_name}: $${total.toLocaleString()}`);
			} else {
				console.warn(`⚠ ${m.full_name}: no total found in response — skipped`);
			}
			await new Promise((r) => setTimeout(r, 250)); // be polite to the API
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
