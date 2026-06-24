/**
 * CANARY BLAIR — One-Time Data Bootstrap
 *
 * Downloads the full WV legislative dataset from LegiScan as a ZIP,
 * parses all bills, members, votes, and loads them into Supabase.
 *
 * Uses batched upserts (50-100 records per request) for speed.
 *
 * Usage: node pipeline/bootstrap.js
 */
import 'dotenv/config';
import AdmZip from 'adm-zip';

// ─────────────────────────────────────────
// CONFIG & VALIDATION
// ─────────────────────────────────────────

const LEGISCAN_API_KEY = process.env.LEGISCAN_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!LEGISCAN_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing required environment variables.');
	console.error('   Ensure LEGISCAN_API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_KEY are set in .env');
	process.exit(1);
}

const API_BASE = 'https://api.legiscan.com/';
const STATE = 'WV';

const STATUS_CODES = {
	1: 'Introduced',
	2: 'Engrossed',
	3: 'Enrolled',
	4: 'Passed',
	5: 'Vetoed',
	6: 'Failed/Dead'
};

const VOTE_CODES = {
	1: 'Yea',
	2: 'Nay',
	3: 'NV',
	4: 'Absent'
};

let queryCount = 0;

// ─────────────────────────────────────────
// LEGISCAN API HELPERS
// ─────────────────────────────────────────

async function legiscanFetch(op, params = {}) {
	const url = new URL(API_BASE);
	url.searchParams.set('key', LEGISCAN_API_KEY);
	url.searchParams.set('op', op);
	for (const [k, v] of Object.entries(params)) {
		url.searchParams.set(k, v);
	}
	queryCount++;
	const res = await fetch(url.toString());
	if (!res.ok) throw new Error(`LegiScan HTTP ${res.status} on ${op}`);
	const data = await res.json();
	if (data.status === 'ERROR') {
		throw new Error(`LegiScan API error on ${op}: ${data.alert?.message}`);
	}
	return data;
}

// ─────────────────────────────────────────
// SUPABASE HELPERS
// ─────────────────────────────────────────

async function upsert(table, data, onConflict = 'id') {
	const body = Array.isArray(data) ? data : [data];
	if (body.length === 0) return;
	const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY,
			Prefer: 'resolution=merge-duplicates,return=minimal'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Upsert ${table} error (${body.length} rows): ${err}`);
	}
}

/** Upsert in batches of `size` */
async function batchUpsert(table, rows, onConflict = 'id', size = 75) {
	for (let i = 0; i < rows.length; i += size) {
		const batch = rows.slice(i, i + size);
		try {
			await upsert(table, batch, onConflict);
		} catch (err) {
			// If a batch fails, fall back to individual upserts so one bad row doesn't kill the batch
			console.error(`   ⚠ Batch ${table} failed (${batch.length} rows), retrying individually...`);
			for (const row of batch) {
				try {
					await upsert(table, row, onConflict);
				} catch (err2) {
					console.error(`   ⚠ Individual ${table} upsert failed: ${err2.message}`);
				}
			}
		}
	}
}

/** Delete all rows from a table (optionally filtered), then batch insert */
async function deleteAndInsert(table, rows, size = 75) {
	// Delete all existing rows
	const delRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=gt.0`, {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY,
			Prefer: 'return=minimal'
		}
	});
	if (!delRes.ok) {
		const err = await delRes.text();
		console.error(`   ⚠ Delete ${table} failed: ${err}`);
	}

	// Insert in batches (plain POST, no upsert)
	for (let i = 0; i < rows.length; i += size) {
		const batch = rows.slice(i, i + size);
		const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
				apikey: SUPABASE_SERVICE_KEY,
				Prefer: 'return=minimal'
			},
			body: JSON.stringify(batch)
		});
		if (!res.ok) {
			const err = await res.text();
			console.error(`   ⚠ Insert batch ${table} failed (${batch.length} rows): ${err}`);
		}
	}
}

async function supabaseSelect(table, filter = '') {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${filter ? '?' + filter : ''}`, {
		headers: {
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY
		}
	});
	if (!res.ok) throw new Error(`Select ${table} error`);
	return res.json();
}

// ─────────────────────────────────────────
// MAIN BOOTSTRAP
// ─────────────────────────────────────────

async function run() {
	const startTime = Date.now();
	console.log('🐦 Canary Blair bootstrap starting...\n');

	// ── Step 1: Get current WV session ──────
	console.log('📋 Fetching session list...');
	const sessionData = await legiscanFetch('getSessionList', { state: STATE });
	const sessions = sessionData.sessions;
	const currentSession = sessions
		.filter((s) => s.prior !== 1)
		.sort((a, b) => b.year_start - a.year_start)[0];

	if (!currentSession) throw new Error('No current WV session found');

	console.log(`   Session: ${currentSession.session_name} (ID: ${currentSession.session_id})`);

	await upsert('sessions', {
		id: currentSession.session_id,
		year_start: currentSession.year_start,
		year_end: currentSession.year_end,
		name: currentSession.session_name,
		special: currentSession.special === 1,
		sine_die: currentSession.sine_die === 1,
		prior: false,
		updated_at: new Date().toISOString()
	});

	// ── Step 2: Check for available datasets ──────
	console.log('📦 Checking available datasets...');
	const datasetListData = await legiscanFetch('getDatasetList', { state: STATE });
	const datasets = datasetListData.datasetlist;
	const dataset = datasets.find((d) => d.session_id === currentSession.session_id);

	if (!dataset) throw new Error('No dataset available for current session');

	const datasetHash = dataset.dataset_hash;
	const accessKey = dataset.access_key;
	console.log(`   Dataset found: hash=${datasetHash.slice(0, 12)}...`);

	// Check if already bootstrapped (skip check with --force flag)
	if (!process.argv.includes('--force')) {
		const existingLogs = await supabaseSelect(
			'sync_log',
			`select=id&status=eq.bootstrap&error_message=eq.${datasetHash}`
		);
		if (existingLogs.length > 0) {
			console.log('✅ Dataset already bootstrapped, skipping. Use --force to re-run.');
			return;
		}
	}

	// ── Step 3: Download the dataset ZIP ──────
	console.log('📥 Downloading dataset ZIP (this may take a moment)...');
	const datasetData = await legiscanFetch('getDataset', {
		id: currentSession.session_id,
		access_key: accessKey
	});

	if (!datasetData.dataset?.zip) {
		throw new Error('No ZIP data in dataset response');
	}

	const zipBuffer = Buffer.from(datasetData.dataset.zip, 'base64');
	console.log(`   ZIP size: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

	// ── Step 4: Unzip and organize files ──────
	console.log('📂 Extracting ZIP...');
	const zip = new AdmZip(zipBuffer);
	const entries = zip.getEntries();

	const peopleFiles = [];
	const billFiles = [];
	const voteFiles = [];

	for (const entry of entries) {
		if (entry.isDirectory) continue;
		const name = entry.entryName;
		if (name.includes('/people/')) peopleFiles.push(entry);
		else if (name.includes('/bill/')) billFiles.push(entry);
		else if (name.includes('/vote/')) voteFiles.push(entry);
	}

	console.log(`   Found: ${peopleFiles.length} people, ${billFiles.length} bills, ${voteFiles.length} roll calls\n`);

	const sessionId = currentSession.session_id;
	let totalMembers = 0;
	let totalBills = 0;
	let totalVotes = 0;

	// ── Step 5: Process people (batched) ──────
	console.log('👥 Processing members...');
	const memberRows = [];
	const memberSessionRows = [];

	for (const entry of peopleFiles) {
		try {
			const json = JSON.parse(entry.getData().toString('utf8'));
			const person = json.person;
			if (!person?.people_id) continue;

			memberRows.push({
				id: person.people_id,
				legiscan_id: person.people_id,
				first_name: person.first_name || '',
				middle_name: person.middle_name || null,
				last_name: person.last_name || '',
				suffix: person.suffix || null,
				nickname: person.nickname || null,
				full_name: person.name,
				party: person.party || null,
				role: person.role || null,
				district: person.district || null,
				chamber: person.role_id === 1 ? 'H' : 'S',
				followthemoney_eid: person.followthemoney_eid || null,
				votesmart_id: person.votesmart_id || null,
				opensecrets_id: person.opensecrets_id || null,
				ballotpedia: person.ballotpedia || null,
				updated_at: new Date().toISOString()
			});

			memberSessionRows.push({
				member_id: person.people_id,
				session_id: sessionId,
				party: person.party || null,
				role: person.role || null,
				district: person.district || null
			});

			totalMembers++;
		} catch (err) {
			console.error(`   ⚠ Failed to parse person ${entry.entryName}: ${err.message}`);
		}
	}

	await batchUpsert('members', memberRows, 'id', 75);
	await batchUpsert('member_sessions', memberSessionRows, 'member_id,session_id', 75);
	console.log(`   👥 Processed ${totalMembers} members\n`);

	// ── Step 6: Process bills (batched) ──────
	console.log('📄 Processing bills...');
	const billRows = [];
	const sponsorMemberRows = [];
	const sponsorRows = [];
	const actionRows = [];

	for (let i = 0; i < billFiles.length; i++) {
		const entry = billFiles[i];
		try {
			const json = JSON.parse(entry.getData().toString('utf8'));
			const bill = json.bill;
			if (!bill?.bill_id) continue;

			const latestText = bill.texts?.length ? bill.texts[bill.texts.length - 1] : null;
			const billTextUrl = latestText?.state_link || latestText?.url || bill.url || null;

			billRows.push({
				id: bill.bill_id,
				legiscan_id: bill.bill_id,
				session_id: sessionId,
				bill_number: bill.bill_number,
				bill_type: bill.bill_type,
				title: bill.title,
				description: bill.description || null,
				chamber: bill.body_id === 1 ? 'H' : 'S',
				status: bill.status,
				status_text: STATUS_CODES[bill.status] || 'Unknown',
				status_date: bill.status_date || null,
				introduced_date: bill.introduced_date || null,
				last_action: bill.last_action || null,
				last_action_date: bill.last_action_date || null,
				change_hash: bill.change_hash,
				bill_text_url: billTextUrl,
				is_archived: bill.status === 4 || bill.status === 5,
				updated_at: new Date().toISOString()
			});

			if (bill.sponsors?.length) {
				for (const sponsor of bill.sponsors) {
					sponsorMemberRows.push({
						id: sponsor.people_id,
						legiscan_id: sponsor.people_id,
						first_name: sponsor.first_name || '',
						last_name: sponsor.last_name || '',
						full_name: sponsor.name,
						party: sponsor.party || null,
						role: sponsor.role || null,
						updated_at: new Date().toISOString()
					});
					sponsorRows.push({
						bill_id: bill.bill_id,
						member_id: sponsor.people_id,
						sponsor_type: sponsor.sponsor_type_id,
						sponsor_type_text: sponsor.sponsor_type
					});
				}
			}

			if (bill.history?.length) {
				for (let j = 0; j < bill.history.length; j++) {
					const action = bill.history[j];
					actionRows.push({
						bill_id: bill.bill_id,
						action_date: action.date,
						chamber: action.chamber || null,
						action_text: action.action,
						sequence: j
					});
				}
			}

			totalBills++;
		} catch (err) {
			console.error(`   ⚠ Failed to parse bill ${entry.entryName}: ${err.message}`);
		}
	}

	// Dedupe sponsor members by id (same person can sponsor many bills)
	const uniqueSponsorMembers = [
		...new Map(sponsorMemberRows.map((m) => [m.id, m])).values()
	];

	console.log(`   Upserting ${billRows.length} bills...`);
	await batchUpsert('bills', billRows, 'id', 75);

	console.log(`   Upserting ${uniqueSponsorMembers.length} sponsor members...`);
	await batchUpsert('members', uniqueSponsorMembers, 'id', 75);

	console.log(`   Upserting ${sponsorRows.length} bill sponsors...`);
	await batchUpsert('bill_sponsors', sponsorRows, 'bill_id,member_id', 75);

	console.log(`   Inserting ${actionRows.length} bill actions (delete+insert)...`);
	await deleteAndInsert('bill_actions', actionRows, 75);

	console.log(`   📄 Processed ${totalBills} bills\n`);

	// ── Step 7: Process votes (batched) ──────
	console.log('🗳️  Processing roll calls and votes...');
	const rollCallRows = [];
	const voteRows = [];

	for (let i = 0; i < voteFiles.length; i++) {
		const entry = voteFiles[i];
		try {
			const json = JSON.parse(entry.getData().toString('utf8'));
			const rc = json.roll_call;
			if (!rc?.roll_call_id) continue;

			rollCallRows.push({
				id: rc.roll_call_id,
				legiscan_id: rc.roll_call_id,
				bill_id: rc.bill_id,
				session_id: sessionId,
				chamber: rc.chamber === 'H' ? 'H' : 'S',
				date: rc.date,
				description: rc.desc || null,
				yea: rc.yea,
				nay: rc.nay,
				nv: rc.nv,
				absent: rc.absent,
				total: rc.total,
				passed: rc.passed === 1
			});

			if (rc.votes?.length) {
				for (const vote of rc.votes) {
					voteRows.push({
						roll_call_id: rc.roll_call_id,
						member_id: vote.people_id,
						bill_id: rc.bill_id,
						vote_value: vote.vote_id,
						vote_text: VOTE_CODES[vote.vote_id] || 'Unknown'
					});
					totalVotes++;
				}
			}
		} catch (err) {
			console.error(`   ⚠ Failed to parse roll call ${entry.entryName}: ${err.message}`);
		}
	}

	console.log(`   Upserting ${rollCallRows.length} roll calls...`);
	await batchUpsert('roll_calls', rollCallRows, 'id', 75);

	console.log(`   Upserting ${voteRows.length} votes...`);
	await batchUpsert('votes', voteRows, 'roll_call_id,member_id', 100);

	console.log(`   🗳️  Processed ${voteFiles.length} roll calls (${totalVotes.toLocaleString()} individual votes)\n`);

	// ── Step 8: Write bootstrap log ──────
	await upsert(
		'sync_log',
		{
			status: 'bootstrap',
			bills_checked: totalBills,
			bills_new: totalBills,
			bills_updated: 0,
			votes_added: totalVotes,
			members_updated: totalMembers,
			queries_used: queryCount,
			error_message: datasetHash,
			duration_ms: Date.now() - startTime
		},
		'id'
	);

	// ── Summary ──────
	const duration = Date.now() - startTime;
	const mins = Math.floor(duration / 60000);
	const secs = Math.floor((duration % 60000) / 1000);

	console.log('═══════════════════════════════════════');
	console.log('✅ Bootstrap complete!');
	console.log(`   Session:    ${currentSession.session_name}`);
	console.log(`   Members:    ${totalMembers.toLocaleString()}`);
	console.log(`   Bills:      ${totalBills.toLocaleString()}`);
	console.log(`   Roll calls: ${voteFiles.length.toLocaleString()}`);
	console.log(`   Votes:      ${totalVotes.toLocaleString()}`);
	console.log(`   API queries: ${queryCount}`);
	console.log(`   Duration:   ${mins}m ${secs}s`);
	console.log('═══════════════════════════════════════');
}

run().catch((err) => {
	console.error('\n❌ Bootstrap failed:', err.message);
	process.exit(1);
});
