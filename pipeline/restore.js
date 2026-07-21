/**
 * CANARY BLAIR — Database restore
 *
 * Restores a backup created by `npm run backup` — the other half of
 * "restore, not re-pay." After a wipe, this brings back everything (including
 * the expensive AI summaries/classifications, overrides, score history, and
 * reports) without a single Anthropic API call.
 *
 * Usage:
 *   npm run restore backups/2026-07-21T.../     # restore from a backup folder
 *   node pipeline/restore.js --dir=backups/...
 *
 * Restore INTO A FRESH / EMPTY database (with the schema migrations already
 * applied). Tables are restored parents-first so foreign keys resolve.
 *
 * ── How ids are handled ─────────────────────────────────────
 * Tables keyed by an external LegiScan id (sessions, members, bills, roll_calls,
 * committees) keep their ids and upsert on id — because other rows reference
 * them. Tables with an internal SERIAL id (votes, sponsors, actions, history,
 * reports, …) are restored WITHOUT their id (the database assigns fresh ones)
 * and deduped on a natural key where one exists — nothing references those ids,
 * so this avoids any sequence conflicts on future inserts.
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

// Parents first so foreign keys resolve. keepId=true tables are referenced by
// others (preserve ids); keepId=false tables have a surrogate SERIAL id nothing
// references (drop it, dedupe on the natural key when present).
const RESTORE_ORDER = [
	{ table: 'sessions', keepId: true, conflict: 'id' },
	{ table: 'members', keepId: true, conflict: 'id' },
	{ table: 'committees', keepId: true, conflict: 'id' },
	{ table: 'bills', keepId: true, conflict: 'id' },
	{ table: 'roll_calls', keepId: true, conflict: 'id' },
	{ table: 'bill_sponsors', keepId: false, conflict: 'bill_id,member_id' },
	{ table: 'votes', keepId: false, conflict: 'roll_call_id,member_id' },
	{ table: 'member_sessions', keepId: false, conflict: 'member_id,session_id' },
	{ table: 'session_digests', keepId: false, conflict: 'session_id,period_type,period_start' },
	{ table: 'member_score_history', keepId: false, conflict: 'member_id,session_id,snapshot_date' },
	{ table: 'bill_actions', keepId: false, conflict: null }, // no natural key — plain insert (fresh DB)
	{ table: 'classification_reports', keepId: false, conflict: null },
	{ table: 'sync_log', keepId: false, conflict: null }
];

const BATCH = 200;

const dirArg = process.argv.find((a) => a.startsWith('--dir='));
const positional = process.argv.slice(2).find((a) => !a.startsWith('--'));
const dir = dirArg ? dirArg.split('=')[1] : positional;

if (!dir) {
	console.error('Usage: node pipeline/restore.js <backup-dir>   (e.g. backups/2026-07-21T12-00-00-000Z)');
	process.exit(1);
}

function headers(extra = {}) {
	return {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
		apikey: SUPABASE_SERVICE_KEY,
		...extra
	};
}

async function insertBatch(table, conflict, rows) {
	const url = `${SUPABASE_URL}/rest/v1/${table}${conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : ''}`;
	const prefer = conflict ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal';
	const res = await fetch(url, { method: 'POST', headers: headers({ Prefer: prefer }), body: JSON.stringify(rows) });
	if (!res.ok) throw new Error(`${table}: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
}

async function run() {
	console.log(`♻️  Restoring from ${dir}\n`);
	let grand = 0;

	for (const { table, keepId, conflict } of RESTORE_ORDER) {
		const file = join(dir, `${table}.json`);
		if (!existsSync(file)) {
			console.warn(`  ⚠  ${table.padEnd(24)} no backup file — skipped`);
			continue;
		}
		let rows;
		try {
			rows = JSON.parse(readFileSync(file, 'utf8'));
		} catch (err) {
			console.warn(`  ⚠  ${table.padEnd(24)} bad JSON — skipped (${err.message})`);
			continue;
		}
		if (!Array.isArray(rows) || rows.length === 0) {
			console.log(`  ·  ${table.padEnd(24)} empty`);
			continue;
		}

		const prepared = keepId ? rows : rows.map(({ id, ...rest }) => rest);

		try {
			for (let i = 0; i < prepared.length; i += BATCH) {
				await insertBatch(table, conflict, prepared.slice(i, i + BATCH));
			}
			grand += prepared.length;
			console.log(`  ✅ ${table.padEnd(24)} ${prepared.length.toLocaleString()} rows`);
		} catch (err) {
			console.error(`  ✗  ${table.padEnd(24)} ${err.message}`);
		}
	}

	console.log(`\n✅ Restore complete: ${grand.toLocaleString()} rows. No Anthropic calls made.`);
	console.log('   (If the app looks right but a later sync errors on a duplicate id, restore into a truly empty DB.)');
}

run().catch((err) => {
	console.error('\n❌ Restore failed:', err.message);
	process.exit(1);
});
