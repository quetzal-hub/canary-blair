/**
 * CANARY BLAIR — Executive-request bill scan
 *
 * Marks bills.executive_request=true for bills carrying "[By Request of the
 * Executive]" in their text — the bills the Governor asked the legislature to
 * pass (his championed agenda). LegiScan doesn't expose this; the marker lives
 * in the bill text, so we fetch and scan it.
 *
 * Scoped to bills the Governor ACTED ON (signed/vetoed/became law unsigned) —
 * the set where "requested AND enacted" is the strongest ownership signal and
 * where it affects his Canary Score. Reuses summarize's polite bill-text fetch.
 *
 * Dry-run by default; --commit to write.
 *
 * Usage:
 *   node pipeline/executive-request-scan.js            # dry run
 *   node pipeline/executive-request-scan.js --commit   # write
 */
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const COMMIT = process.argv.includes('--commit');
const MARKER = /by\s+request\s+of\s+the\s+executive/i;

function dbHeaders(extra = {}) {
	return { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY, ...extra };
}

async function fetchAll(path) {
	const rows = [];
	let offset = 0;
	while (true) {
		const sep = path.includes('?') ? '&' : '?';
		const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${sep}offset=${offset}&limit=1000`, { headers: dbHeaders() });
		if (!res.ok) throw new Error(`DB fetch: ${await res.text()}`);
		const batch = await res.json();
		rows.push(...batch);
		if (batch.length < 1000) break;
		offset += 1000;
	}
	return rows;
}

async function billTextHasMarker(url) {
	if (!url) return false;
	try {
		const res = await fetch(url, { headers: { 'User-Agent': 'CanaryBlair/1.0 (civic accountability tool)' } });
		if (!res.ok) return false;
		return MARKER.test(await res.text());
	} catch {
		return false;
	}
}

async function run() {
	console.log(`🖋️  Executive-request scan — ${COMMIT ? 'COMMIT' : 'DRY RUN'}\n`);

	// Bills the Governor acted on, via bill_actions.
	const actions = await fetchAll(
		"bill_actions?select=bill_id&or=(action_text.ilike.*Approved%20by%20Governor*,action_text.ilike.*Vetoed%20by%20Governor*,action_text.ilike.*Became%20law%20without*)"
	);
	const billIds = [...new Set(actions.map((a) => a.bill_id))];
	console.log(`${billIds.length} bills the Governor acted on. Scanning text for the executive-request marker...\n`);

	// Fetch their text URLs.
	const bills = [];
	for (let i = 0; i < billIds.length; i += 100) {
		const batch = billIds.slice(i, i + 100);
		bills.push(...(await fetchAll(`bills?select=id,bill_number,bill_text_url,executive_request&id=in.(${batch.join(',')})`)));
	}

	// Scan with modest concurrency.
	const CONC = 6;
	let next = 0, found = 0, changed = 0;
	const matched = [];
	async function worker() {
		while (true) {
			const i = next++;
			if (i >= bills.length) return;
			const b = bills[i];
			const has = await billTextHasMarker(b.bill_text_url);
			if (has) {
				found++;
				matched.push(b);
				if (!b.executive_request) changed++;
			}
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	await Promise.all(Array.from({ length: CONC }, worker));

	console.log(`Found ${found} executive-request bills (${changed} newly marked):`);
	for (const b of matched) console.log(`  ${b.bill_number}`);

	if (!COMMIT) {
		console.log('\nDry run — run with --commit to write.');
		return;
	}

	// Set the flag on matched bills (and clear any stale true on acted-on bills no longer matching).
	const matchedIds = new Set(matched.map((b) => b.id));
	const toSet = matched.filter((b) => !b.executive_request).map((b) => b.id);
	const toClear = bills.filter((b) => b.executive_request && !matchedIds.has(b.id)).map((b) => b.id);

	const patch = async (ids, value) => {
		for (let i = 0; i < ids.length; i += 200) {
			const batch = ids.slice(i, i + 200);
			const res = await fetch(`${SUPABASE_URL}/rest/v1/bills?id=in.(${batch.join(',')})`, {
				method: 'PATCH',
				headers: dbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
				body: JSON.stringify({ executive_request: value })
			});
			if (!res.ok) throw new Error(`patch: ${await res.text()}`);
		}
	};
	if (toSet.length) await patch(toSet, true);
	if (toClear.length) await patch(toClear, false);
	console.log(`\n✅ Marked ${toSet.length} bills executive_request=true${toClear.length ? `, cleared ${toClear.length}` : ''}.`);
}

run().catch((err) => {
	console.error('\n❌ Scan failed:', err.message);
	process.exit(1);
});
