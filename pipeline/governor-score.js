/**
 * CANARY BLAIR — Governor Canary Score runner
 *
 * Computes the governor's score from bill_actions (Approved / Vetoed /
 * Became law without signature) joined against the same AI classifications
 * the legislator scores use, via the pure engine in lib/governor-scoring.js.
 * Writes score + tier + a full audit-trail breakdown to the officials row
 * (slug 'governor').
 *
 * Like score.js, this writes derived, reproducible math directly — no
 * dry-run gate. Re-run any time classifications change.
 *
 * Usage: npm run governor-score
 */
import 'dotenv/config';
import { fetchAllRows, TIER_NAMES } from './lib/scoring.js';
import { scoreGovernor } from './lib/governor-scoring.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const db = { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_SERVICE_KEY };

async function run() {
	console.log('🏛️  Governor Canary Score calculation starting...\n');

	// Every action row that could be a governor action; deduped per bill in JS
	// (journal variants: "Vetoed by Governor 4/1/2026 - Senate Journal" etc.)
	const [approved, vetoed, noSig] = await Promise.all([
		fetchAllRows(db, 'bill_actions?select=bill_id,action_text&action_text=ilike.*Approved%20by%20Governor*'),
		fetchAllRows(db, 'bill_actions?select=bill_id,action_text&action_text=ilike.*Vetoed%20by%20Governor*'),
		fetchAllRows(db, "bill_actions?select=bill_id,action_text&action_text=ilike.*Became%20law%20without*")
	]);

	const actionsByBill = new Map();
	for (const row of [...approved, ...vetoed, ...noSig]) {
		if (!actionsByBill.has(row.bill_id)) actionsByBill.set(row.bill_id, []);
		actionsByBill.get(row.bill_id).push(row.action_text);
	}
	console.log(`📜 Governor acted on ${actionsByBill.size} bills (${new Set(approved.map(r => r.bill_id)).size} signed, ${new Set(vetoed.map(r => r.bill_id)).size} vetoed, ${new Set(noSig.map(r => r.bill_id)).size} became law unsigned)`);

	const bills = await fetchAllRows(
		db,
		'bills?select=id,bill_number,title,ai_tags,ai_alignment,ai_alignment_override,ai_impact_tier,ai_impact_tier_override,ai_confidence&ai_tags=not.is.null'
	);
	console.log(`📊 ${bills.length} classified bills loaded`);

	const { score, tier, items, totals } = scoreGovernor({ bills, actionsByBill });

	if (score == null) {
		console.log('\nNo scoreable governor actions yet — nothing written.');
		return;
	}

	console.log(`\n🐦 Governor Canary Score: ${score}/100 — ${TIER_NAMES[tier] || tier}`);
	console.log(`   Signed: ${totals.signed_people} people / ${totals.signed_capital} capital`);
	console.log(`   Vetoed: ${totals.vetoed_people} people / ${totals.vetoed_capital} capital`);
	console.log(`   Unsigned into law: ${totals.no_signature_people} people / ${totals.no_signature_capital} capital`);
	console.log(`   (${totals.actions_scored} of ${totals.actions_total} actions were on aligned bills)`);

	const res = await fetch(`${SUPABASE_URL}/rest/v1/officials?slug=eq.governor`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY,
			Prefer: 'return=minimal'
		},
		body: JSON.stringify({
			canary_score: score,
			canary_tier: tier,
			score_breakdown: { items, totals },
			score_updated_at: new Date().toISOString()
		})
	});
	if (!res.ok) throw new Error(`Patch officials/governor: ${await res.text()}`);
	console.log('\n✅ Written to officials.governor');
}

run().catch((err) => {
	console.error('\n❌ Governor score failed:', err.message);
	process.exit(1);
});
