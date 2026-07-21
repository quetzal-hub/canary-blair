/**
 * CANARY BLAIR — FollowTheMoney entity-id export (step 1 of 2)
 *
 * FollowTheMoney's Ask Anything API has no name-search token — every
 * candidate filter (c-t-id, c-t-eid) requires an entity id you already have,
 * and filtering by name is explicitly disabled. So matching a legislator to
 * their FTM record can't be automated; it needs one human-verified lookup per
 * person (confirming you've got the right WV legislator, not a same-named
 * person from another state — a wrong match would misattribute real money to
 * the wrong named politician, which is worse than showing nothing).
 *
 * This script writes a CSV (sorted by last name) with an empty `eid` column.
 * Search followthemoney.org for each legislator by hand, confirm you've got
 * the right WV officeholder, and paste the number from their entity page URL
 * (…/entity-details?eid=NUMBER) into the eid column. Then run
 * finance-eid-import.js to write the results back to the database.
 *
 * Usage:
 *   node pipeline/finance-eid-export.js                  # all current members
 *   node pipeline/finance-eid-export.js --out=eids.csv    # custom output path
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { toCsvRow } from './lib/csv.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT_PATH = outArg ? outArg.split('=')[1] : 'finance-eids.csv';

async function fetchMembers() {
	const res = await fetch(
		`${SUPABASE_URL}/rest/v1/members?select=id,full_name,party,chamber,district,followthemoney_eid&is_current=eq.true`,
		{ headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
	);
	if (!res.ok) throw new Error(`DB fetch error: ${await res.text()}`);
	return res.json();
}

/** Last whitespace-separated token of the full name — good enough for sorting this list. */
function lastName(fullName) {
	const parts = fullName.trim().split(/\s+/);
	return parts[parts.length - 1].toLowerCase();
}

async function run() {
	console.log('📇 Exporting members for FollowTheMoney entity-id matching...\n');
	const members = await fetchMembers();
	members.sort((a, b) => lastName(a.full_name).localeCompare(lastName(b.full_name)));

	const rows = [toCsvRow(['member_id', 'full_name', 'party', 'chamber', 'district', 'eid'])];
	let alreadyMatched = 0;
	for (const m of members) {
		if (m.followthemoney_eid) alreadyMatched++;
		rows.push(
			toCsvRow([
				m.id,
				m.full_name,
				m.party || '',
				m.chamber || '',
				m.district || '',
				m.followthemoney_eid || '' // pre-filled if already matched — leave as-is or correct it
			])
		);
	}

	writeFileSync(OUT_PATH, rows.join('\n') + '\n', 'utf8');
	console.log(`✅ Wrote ${members.length} members to ${OUT_PATH} (sorted by last name; ${alreadyMatched} already have an eid)`);
	console.log('\nNext steps:');
	console.log('  1. Open the CSV and search followthemoney.org for each legislator by name.');
	console.log('  2. Confirm it\'s the right person (WV, matching chamber/district) before using their eid —');
	console.log('     paste the number from their entity page URL (…/entity-details?eid=NUMBER) into the eid column.');
	console.log('  3. Leave eid blank for anyone you can\'t confidently confirm — skipping is safer than guessing.');
	console.log(`  4. Run: node pipeline/finance-eid-import.js ${OUT_PATH}`);
}

run().catch((err) => {
	console.error('\n❌ Export failed:', err.message);
	process.exit(1);
});
