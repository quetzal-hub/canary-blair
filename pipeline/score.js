/**
 * CANARY BLAIR — Canary Score Calculator (CLI runner)
 *
 * Thin wrapper around the shared scoring engine in pipeline/lib/scoring.js —
 * the same code the deployed AI worker runs, so local and production scores
 * can never drift.
 *
 * Usage: node pipeline/score.js
 */
import 'dotenv/config';
import { scoreMembers, writeScores, appendScoreHistory, fetchPriorScores, fetchAllRows, getTier } from './lib/scoring.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const db = { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_SERVICE_KEY };

async function run() {
	const startTime = Date.now();
	console.log('🐦 Canary Score calculation starting...\n');

	// Overrides + confidence matter: the engine scores effective (post-override)
	// values and discounts low-confidence AI calls.
	const bills = await fetchAllRows(db, 'bills?select=id,ai_tags,ai_alignment,ai_alignment_override,ai_impact_tier,ai_impact_tier_override,ai_confidence,status&ai_tags=not.is.null');
	const forPeopleCount = bills.filter((b) => b.ai_alignment === 'for_people').length;
	const forCapitalCount = bills.filter((b) => b.ai_alignment === 'for_capital').length;
	console.log(`📊 Loaded ${bills.length} tagged bills — ${forPeopleCount} FOR_PEOPLE, ${forCapitalCount} FOR_CAPITAL, ${bills.length - forPeopleCount - forCapitalCount} NEUTRAL`);

	const votes = await fetchAllRows(db, 'votes?select=member_id,vote_value,bill_id,roll_call_id');
	console.log(`🗳️  Loaded ${votes.length.toLocaleString()} votes`);

	// Roll-call dates drive final-vote dedupe; yea/nay drive contested-vote weighting;
	// description lets the engine drop tangled procedural motions from scoring.
	const rollCalls = await fetchAllRows(db, 'roll_calls?select=id,date,yea,nay,description');

	const members = await fetchAllRows(db, 'members?select=id,full_name,party,chamber');
	const sponsorships = await fetchAllRows(db, 'bill_sponsors?select=member_id,bill_id,sponsor_type');
	console.log(`📝 Loaded ${sponsorships.length.toLocaleString()} sponsorships`);

	// Determine current + prior session so we can snapshot history and compute
	// the Most Improved badge against last session's final scores.
	const [current] = await fetchAllRows(db, 'sessions?select=id,year_start&prior=eq.false&order=year_start.desc&limit=1');
	const [prior] = await fetchAllRows(db, 'sessions?select=id&prior=eq.true&order=year_start.desc&limit=1');
	const priorScores = prior ? await fetchPriorScores(db, prior.id) : new Map();
	console.log(`👥 Scoring ${members.length} members${prior ? ` (comparing to ${priorScores.size} prior-session scores)` : ''}...\n`);

	const results = scoreMembers({ bills, votes, members, sponsorships, priorScores, rollCalls });

	const written = await writeScores(db, results);
	if (current) {
		const snapped = await appendScoreHistory(db, results, current.id);
		if (snapped) console.log(`🗂️  Snapshotted ${snapped} scores to permanent history (session ${current.id})`);
	}

	const scored = results.filter((r) => r.canary_score !== null).sort((a, b) => b.canary_score - a.canary_score);
	const unscored = results.filter((r) => r.canary_score === null);
	console.log(`✅ Scores written for ${written} members (${scored.length} scored, ${unscored.length} unscored)\n`);

	if (scored.length > 0) {
		console.log('Top 5 Canary Scores:');
		for (const m of scored.slice(0, 5)) {
			const t = getTier(m.canary_score);
			console.log(`  ${m.canary_score.toString().padStart(3)} ${t.emoji} ${m.full_name} (${m.party}) — ${t.name}`);
		}

		console.log('\nBottom 5 Canary Scores:');
		for (const m of scored.slice(-5).reverse()) {
			const t = getTier(m.canary_score);
			console.log(`  ${m.canary_score.toString().padStart(3)} ${t.emoji} ${m.full_name} (${m.party}) — ${t.name}`);
		}

		const badgeCounts = {};
		for (const r of results) {
			for (const b of r.canary_badges) {
				badgeCounts[b] = (badgeCounts[b] || 0) + 1;
			}
		}
		if (Object.keys(badgeCounts).length) {
			console.log('\nBadge distribution:');
			for (const [badge, count] of Object.entries(badgeCounts).sort((a, b) => b[1] - a[1])) {
				console.log(`  ${badge}: ${count} members`);
			}
		}
	}

	console.log(`\nDuration: ${Math.floor((Date.now() - startTime) / 1000)}s`);
}

run().catch((err) => {
	console.error('\n❌ Score calculation failed:', err.message);
	process.exit(1);
});
