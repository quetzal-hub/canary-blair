/**
 * CANARY BLAIR — Database backup
 *
 * Dumps every data table to timestamped JSON files. The raw legislative data is
 * re-derivable from LegiScan (via `npm run bootstrap`), so the real value here is
 * protecting the EXPENSIVE and IRREPLACEABLE parts: the AI summaries/
 * classifications (which cost real money to regenerate), human overrides, score
 * history, and any classification reports.
 *
 * A future wipe becomes a restore instead of a re-pay.
 *
 * Usage:
 *   npm run backup                      # writes to backups/<timestamp>/
 *   node pipeline/backup.js --dir=/path # custom output directory
 *
 * Cron it (or run before risky changes) and copy the folder somewhere safe —
 * another machine, cloud storage, an external drive.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchAllRows } from './lib/scoring.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const db = { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_SERVICE_KEY };

// Every data table (views like member_vote_summary are derived — no need to back
// them up). Order doesn't matter for a dump.
const TABLES = [
	'sessions',
	'members',
	'committees',
	'bills',
	'bill_sponsors',
	'roll_calls',
	'votes',
	'bill_actions',
	'member_sessions',
	'session_digests',
	'member_score_history',
	'classification_reports',
	'sync_log'
];

const dirArg = process.argv.find((a) => a.startsWith('--dir='));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = dirArg ? dirArg.split('=')[1] : `backups/${stamp}`;

async function run() {
	mkdirSync(outDir, { recursive: true });
	console.log(`💾 Backing up to ${outDir}\n`);

	const manifest = { generated_at: new Date().toISOString(), source: SUPABASE_URL, tables: {} };
	let totalRows = 0;

	for (const table of TABLES) {
		try {
			const rows = await fetchAllRows(db, `${table}?select=*`);
			writeFileSync(`${outDir}/${table}.json`, JSON.stringify(rows, null, 2));
			manifest.tables[table] = rows.length;
			totalRows += rows.length;
			console.log(`  ✅ ${table.padEnd(24)} ${rows.length.toLocaleString()} rows`);
		} catch (err) {
			// A table might not exist yet if a migration hasn't been applied — note and continue.
			manifest.tables[table] = `ERROR: ${err.message}`;
			console.warn(`  ⚠  ${table.padEnd(24)} skipped (${err.message})`);
		}
	}

	writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
	console.log(`\n📦 Backup complete: ${totalRows.toLocaleString()} rows across ${TABLES.length} tables → ${outDir}`);
	if (totalRows === 0) {
		console.warn('⚠  Every table was empty — nothing to back up (is the database populated?).');
	}
}

run().catch((err) => {
	console.error('\n❌ Backup failed:', err.message);
	process.exit(1);
});
