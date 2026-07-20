/**
 * CANARY BLAIR — Campaign finance sync (FollowTheMoney / OpenSecrets)
 *
 * Populates the finance_* columns on members (schema 011) with total campaign
 * contributions, so a profile can show "who funds this legislator" next to
 * their Canary Score. Matches on the followthemoney_eid we sync from LegiScan
 * first, then falls back to name matching.
 *
 * ── SAFETY: DRY RUN BY DEFAULT ──────────────────────────────
 * The exact JSON field that holds the dollar total is NOT publicly documented,
 * and this is money data attached to real, named politicians — a wrong number
 * is worse than no number. So by default this script writes NOTHING: it fetches
 * a few members, prints the raw API response and the total it extracted, and
 * stops. Confirm the extracted number matches the FollowTheMoney entity page,
 * adjust extractTotalRaised() if needed, THEN run with --commit.
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
 * Extract a total-dollars figure from a FollowTheMoney response. The response
 * shape isn't publicly documented and the Ask Anything API nests every field as
 * {"Field": "value"}, so this searches defensively for a total-money field.
 * VERIFY the result against the entity page before trusting it (that's what the
 * dry run is for). If the number is wrong, fix the field path here.
 */
export function extractTotalRaised(json) {
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

async function fetchEntity(eid) {
	const url = `${FTM_BASE}/entity.php?eid=${encodeURIComponent(eid)}&APIKey=${FTM_API_KEY}&mode=json`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`FTM entity ${eid}: HTTP ${res.status}`);
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
