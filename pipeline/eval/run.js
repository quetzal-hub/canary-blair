/**
 * CANARY BLAIR — Classification eval harness
 *
 * Measures how often the AI's bill classification agrees with YOUR human
 * judgment. This is the single most valuable thing for making classification
 * "as correct as possible": it turns prompt tweaks from guesswork into a number
 * you can move.
 *
 * Setup:
 *   1. cp pipeline/eval/labels.example.json pipeline/eval/labels.json
 *   2. Fill labels.json with your own judgment on 30-50 real bills.
 *   3. npm run eval
 *
 * After changing the prompt, re-summarize those bills and re-run to compare.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const labelsPath = fileURLToPath(new URL('./labels.json', import.meta.url));

let labels;
try {
	labels = JSON.parse(readFileSync(labelsPath, 'utf8')).labels;
} catch {
	console.error('No pipeline/eval/labels.json found. Copy labels.example.json to labels.json and fill it in.');
	process.exit(1);
}
if (!Array.isArray(labels) || labels.length === 0) {
	console.error('labels.json has no labels.');
	process.exit(1);
}

async function fetchBill(id) {
	const res = await fetch(
		`${SUPABASE_URL}/rest/v1/bills?select=id,bill_number,ai_alignment,ai_impact_tier,ai_confidence,ai_alignment_override,ai_impact_tier_override&id=eq.${id}`,
		{ headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
	);
	const [bill] = await res.json();
	return bill;
}

async function run() {
	console.log(`🔬 Evaluating ${labels.length} labeled bills against the AI's classification...\n`);

	let alignHits = 0;
	let tierExact = 0;
	let tierWithin1 = 0;
	let scored = 0;
	const misses = [];

	for (const label of labels) {
		const bill = await fetchBill(label.bill_id);
		if (!bill) {
			console.warn(`⚠ bill ${label.bill_id} not found or not yet summarized — skipped`);
			continue;
		}
		scored++;
		const aiAlign = bill.ai_alignment_override ?? bill.ai_alignment;
		const aiTier = bill.ai_impact_tier_override ?? bill.ai_impact_tier;

		const alignOk = aiAlign === label.alignment;
		const tierDiff = label.impact_tier != null && aiTier != null ? Math.abs(aiTier - label.impact_tier) : null;
		if (alignOk) alignHits++;
		if (tierDiff === 0) tierExact++;
		if (tierDiff != null && tierDiff <= 1) tierWithin1++;

		if (!alignOk || (tierDiff != null && tierDiff > 1)) {
			misses.push({
				bill: bill.bill_number || label.bill_id,
				human: `${label.alignment}/T${label.impact_tier}`,
				ai: `${aiAlign}/T${aiTier}${bill.ai_confidence ? ` (${bill.ai_confidence} conf)` : ''}`,
				notes: label.notes || ''
			});
		}
	}

	const pct = (n) => (scored ? ((n / scored) * 100).toFixed(0) : '—');

	console.log('── Results ──────────────────────────────');
	console.log(`Scored bills:               ${scored}`);
	console.log(`Alignment agreement:        ${pct(alignHits)}%  (${alignHits}/${scored})`);
	console.log(`Impact tier exact:          ${pct(tierExact)}%  (${tierExact}/${scored})`);
	console.log(`Impact tier within ±1:      ${pct(tierWithin1)}%  (${tierWithin1}/${scored})`);

	if (misses.length) {
		console.log('\n── Disagreements (inspect these to tune the prompt) ──');
		for (const m of misses) {
			console.log(`  ${m.bill}: you=${m.human}  ai=${m.ai}`);
			if (m.notes) console.log(`     your note: ${m.notes}`);
		}
	} else {
		console.log('\n🎯 Full agreement on alignment and impact (within ±1).');
	}
}

run().catch((err) => {
	console.error('\n❌ Eval failed:', err.message);
	process.exit(1);
});
