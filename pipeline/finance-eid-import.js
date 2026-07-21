/**
 * CANARY BLAIR — FollowTheMoney entity-id import (step 2 of 2)
 *
 * Reads the CSV produced (and hand-filled) from finance-eid-export.js and
 * writes the confirmed eid column back to members.followthemoney_eid. This
 * id feeds finance.js, which attaches real money figures to a named
 * politician — so, like finance.js itself, this is dry-run by default.
 *
 * Usage:
 *   node pipeline/finance-eid-import.js finance-eids.csv            # dry run: show what would change
 *   node pipeline/finance-eid-import.js finance-eids.csv --commit    # write to the database
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parseCsv } from './lib/csv.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const csvPath = args.find((a) => !a.startsWith('--'));

if (!csvPath) {
	console.error('Usage: node pipeline/finance-eid-import.js <csv-path> [--commit]');
	process.exit(1);
}

async function fetchMembers() {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/members?select=id,full_name,followthemoney_eid&is_current=eq.true`, {
		headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY }
	});
	if (!res.ok) throw new Error(`DB fetch error: ${await res.text()}`);
	return res.json();
}

async function patchEid(memberId, eid) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${memberId}`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY,
			Prefer: 'return=minimal'
		},
		body: JSON.stringify({ followthemoney_eid: eid })
	});
	if (!res.ok) throw new Error(`Patch member ${memberId}: ${await res.text()}`);
}

async function run() {
	console.log(`📥 Importing FollowTheMoney eids from ${csvPath} — ${COMMIT ? 'COMMIT (writing to DB)' : 'DRY RUN (no writes)'}\n`);

	const rows = parseCsv(readFileSync(csvPath, 'utf8'));
	const members = await fetchMembers();
	const byId = new Map(members.map((m) => [String(m.id), m]));

	let toUpdate = 0;
	let unchanged = 0;
	let blank = 0;
	let invalid = 0;
	let notFound = 0;

	for (const row of rows) {
		const member = byId.get(String(row.member_id));
		if (!member) {
			console.warn(`   ⚠ member_id ${row.member_id} (${row.full_name}) not found in DB — skipped`);
			notFound++;
			continue;
		}

		const eid = (row.eid || '').trim();
		if (!eid) {
			blank++;
			continue;
		}
		if (!/^\d+$/.test(eid)) {
			console.warn(`   ⚠ ${member.full_name}: eid "${eid}" isn't a plain number — skipped`);
			invalid++;
			continue;
		}

		if (String(member.followthemoney_eid || '') === eid) {
			unchanged++;
			continue;
		}

		toUpdate++;
		if (!COMMIT) {
			console.log(`   would set ${member.full_name} (id ${member.id}): eid -> ${eid}${member.followthemoney_eid ? ` (was ${member.followthemoney_eid})` : ''}`);
		} else {
			await patchEid(member.id, eid);
			console.log(`   ✅ ${member.full_name}: eid -> ${eid}`);
		}
	}

	console.log(`\n${toUpdate} to update, ${unchanged} unchanged, ${blank} blank (skipped), ${invalid} invalid, ${notFound} not found in DB.`);
	if (!COMMIT && toUpdate > 0) console.log(`\nRun again with --commit to write these ${toUpdate} changes.`);
	else if (COMMIT) console.log(`\nDone. Now run: node pipeline/finance.js   (dry run first, then --commit)`);
}

run().catch((err) => {
	console.error('\n❌ Import failed:', err.message);
	process.exit(1);
});
