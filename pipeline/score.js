/**
 * CANARY BLAIR — Canary Score Calculator
 *
 * Calculates a 0–100 score for every WV legislator based on:
 *   1. Voting record — how they vote on people vs. corporate bills
 *   2. Sponsorship record — what bills they actively champion
 *
 * Sponsorship counts more than voting because putting your name on a bill
 * is a stronger signal of intent than going along with a floor vote.
 *
 * Usage: node pipeline/score.js
 */
import 'dotenv/config';

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

// ─────────────────────────────────────────
// BILL IMPACT TIER WEIGHTS
// ─────────────────────────────────────────
// Each bill has an AI-assigned impact tier (1-6).
// Higher-impact bills carry more weight in the score.

const TIER_WEIGHTS = {
	1: 5,      // Landmark — transformative structural change
	2: 3,      // High Impact — significant real-world consequences
	3: 2,      // Meaningful — clear but narrower scope
	4: 1,      // Routine — standard legislation
	5: 0.5,    // Minor — procedural tweaks
	6: 0.25    // Ceremonial — symbolic, no policy impact
};

function getWeight(bill) {
	const tier = bill.ai_impact_tier;
	if (tier && TIER_WEIGHTS[tier] !== undefined) return TIER_WEIGHTS[tier];
	return 1; // default to Routine if no tier assigned
}

// ─────────────────────────────────────────
// SPONSORSHIP WEIGHTS
// ─────────────────────────────────────────
// Sponsoring a bill is a stronger signal than voting on it.
// Primary sponsors get more weight than cosponsors.
// These multiply with the bill's impact tier weight.

const SPONSOR_WEIGHTS = {
	1: 3,    // Primary sponsor — you wrote or championed it
	2: 1.5   // Cosponsor — you signed on in support
};

const TIER_THRESHOLDS = [
	{ min: 80, tier: 1, name: 'Mountaineer', emoji: '\u2728', tagline: 'Votes like they actually live here.' },
	{ min: 60, tier: 2, name: 'Friend of the Holler', emoji: '\uD83C\uDF31', tagline: "Not perfect, but they're trying." },
	{ min: 45, tier: 3, name: 'Weathervane', emoji: '\uD83C\uDF2B\uFE0F', tagline: 'Blows whichever way the lobby goes.' },
	{ min: 35, tier: 4, name: 'Company Man', emoji: '\uD83E\uDEA8', tagline: "Reliable \u2014 just not for you." },
	{ min: 20, tier: 5, name: 'Rat in the Capitol', emoji: '\uD83D\uDC00', tagline: 'Actively working against the people who elected them.' },
	{ min: 0, tier: 6, name: 'Owned', emoji: '\u2620\uFE0F', tagline: 'Congratulations to their donors on their investment.' }
];

const MIN_SCORED_VOTES = 20;

function getTier(score) {
	for (const t of TIER_THRESHOLDS) {
		if (score >= t.min) return t;
	}
	return TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
}

// ─────────────────────────────────────────
// SUPABASE HELPERS
// ─────────────────────────────────────────

async function supabaseFetch(path) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
		headers: {
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY
		}
	});
	if (!res.ok) throw new Error(`DB fetch error: ${path} — ${await res.text()}`);
	return res.json();
}

async function supabasePatch(table, id, data) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY,
			Prefer: 'return=minimal'
		},
		body: JSON.stringify(data)
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Patch ${table} error: ${err}`);
	}
}

// ─────────────────────────────────────────
// FETCH ALL DATA (paginated — Supabase caps at 1000)
// ─────────────────────────────────────────

async function fetchAll(path) {
	const rows = [];
	let offset = 0;
	const limit = 1000;
	while (true) {
		const sep = path.includes('?') ? '&' : '?';
		const batch = await supabaseFetch(`${path}${sep}offset=${offset}&limit=${limit}`);
		rows.push(...batch);
		if (batch.length < limit) break;
		offset += limit;
	}
	return rows;
}


// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────

async function run() {
	const startTime = Date.now();
	console.log('\uD83D\uDC26 Canary Score calculation starting...\n');

	// 1. Load bills with alignment and impact tier
	const bills = await fetchAll('bills?select=id,ai_tags,ai_alignment,ai_impact_tier&ai_tags=not.is.null');

	// Classify bills using ai_alignment and weight by ai_impact_tier
	const billMap = new Map(); // bill_id → { forPeople, forCapital, weight }
	let forPeopleCount = 0;
	let forCapitalCount = 0;
	let neutralCount = 0;

	for (const bill of bills) {
		const alignment = bill.ai_alignment;

		if (!alignment || alignment === 'neutral') {
			neutralCount++;
			continue;
		}

		const isPeople = alignment === 'for_people';
		const isCapital = alignment === 'for_capital';

		if (isPeople) forPeopleCount++;
		if (isCapital) forCapitalCount++;

		billMap.set(bill.id, {
			forPeople: isPeople,
			forCapital: isCapital,
			weight: getWeight(bill)
		});
	}

	console.log(`\uD83D\uDCCA Loaded ${bills.length} tagged bills \u2014 ${forPeopleCount} FOR_PEOPLE, ${forCapitalCount} FOR_CAPITAL, ${neutralCount} NEUTRAL`);

	// 2. Load all votes
	const votes = await fetchAll('votes?select=member_id,vote_value,bill_id,roll_call_id');
	console.log(`\uD83D\uDDF3\uFE0F  Loaded ${votes.length.toLocaleString()} votes`);

	// 3. Load all members
	const members = await fetchAll('members?select=id,full_name,party,chamber');
	console.log(`\uD83D\uDC65 Scoring ${members.length} members...`);

	// 3b. Load all sponsorships
	const sponsorships = await fetchAll('bill_sponsors?select=member_id,bill_id,sponsor_type');
	console.log(`\uD83D\uDCDD Loaded ${sponsorships.length.toLocaleString()} sponsorships`);

	// Group sponsorships by member
	const memberSponsorships = new Map();
	for (const s of sponsorships) {
		if (!memberSponsorships.has(s.member_id)) memberSponsorships.set(s.member_id, []);
		memberSponsorships.get(s.member_id).push(s);
	}
	console.log('');

	// 4. Build party-majority map for badge calculation
	const memberParty = new Map();
	for (const m of members) {
		memberParty.set(m.id, m.party);
	}

	// Build roll call party majority map
	const rollCallPartyVotes = new Map(); // roll_call_id → { R: {yea, nay}, D: {yea, nay} }
	for (const v of votes) {
		const party = memberParty.get(v.member_id);
		if (!party || !v.roll_call_id) continue;
		if (!rollCallPartyVotes.has(v.roll_call_id)) {
			rollCallPartyVotes.set(v.roll_call_id, { R: { yea: 0, nay: 0 }, D: { yea: 0, nay: 0 } });
		}
		const rc = rollCallPartyVotes.get(v.roll_call_id);
		if (rc[party]) {
			if (v.vote_value === 1) rc[party].yea++;
			else if (v.vote_value === 2) rc[party].nay++;
		}
	}

	// 5. Score each member
	// Group votes by member
	const memberVotes = new Map();
	for (const v of votes) {
		if (!memberVotes.has(v.member_id)) memberVotes.set(v.member_id, []);
		memberVotes.get(v.member_id).push(v);
	}

	const results = [];

	for (const member of members) {
		const myVotes = memberVotes.get(member.id) || [];

		let rawScore = 0;
		let maxPossibleScore = 0; // sum of all weights (best possible score)
		let scoredVoteCount = 0;
		let forPeopleYea = 0, forPeopleNay = 0;
		let forCapitalYea = 0, forCapitalNay = 0;

		// Badge tracking
		let totalScoredRollCalls = 0;
		let partyAlignCount = 0;
		let crossPartyPeopleCount = 0;
		let forCapitalYeaTotal = 0;
		let forCapitalVoteTotal = 0;
		let waterEnvYea = 0, waterEnvTotal = 0;
		let workerYea = 0, workerTotal = 0;
		let totalVotesAll = myVotes.length;
		let nvAbsentAll = myVotes.filter(v => v.vote_value === 3 || v.vote_value === 4).length;

		for (const v of myVotes) {
			const bill = billMap.get(v.bill_id);
			if (!bill) continue; // neutral or untagged

			scoredVoteCount++;
			const w = bill.weight;
			maxPossibleScore += w;

			if (bill.forPeople) {
				if (v.vote_value === 1) { rawScore += w; forPeopleYea++; }
				else if (v.vote_value === 2) { rawScore -= w; forPeopleNay++; }
				else { rawScore -= w * 0.25; } // NV/Absent is a mild negative
			}

			if (bill.forCapital) {
				if (v.vote_value === 1) { rawScore -= w; forCapitalYea++; forCapitalYeaTotal++; forCapitalVoteTotal++; }
				else if (v.vote_value === 2) { rawScore += w; forCapitalVoteTotal++; }
				else { rawScore -= w * 0.25; forCapitalVoteTotal++; } // NV/Absent on bad bills still hurts
			}

			// Party alignment check for badges (only count Yea/Nay votes — NV/Absent aren't a party stance)
			if (v.roll_call_id && member.party && (v.vote_value === 1 || v.vote_value === 2)) {
				totalScoredRollCalls++;
				const rc = rollCallPartyVotes.get(v.roll_call_id);
				if (rc && rc[member.party]) {
					const partyMajority = rc[member.party].yea > rc[member.party].nay ? 1 : 2;
					if (v.vote_value === partyMajority) partyAlignCount++;
					// Cross-party vote on FOR_PEOPLE bill
					if (bill.forPeople && v.vote_value === 1 && partyMajority === 2) {
						crossPartyPeopleCount++;
					}
				}
			}
		}

		// Water/env and worker badge tracking — WEIGHTED by bill impact tier
		// Track weighted Yea votes on BOTH for_people and for_capital tagged bills.
		// Badge requires weighted Yea on significantly more for_people bills than for_capital ones.
		// A Yea on a Landmark bill (5x) counts 20x more than a Yea on a Minor bill (0.25x).
		let waterPeopleYeaW = 0, waterPeopleTotalW = 0, waterPeopleCount = 0;
		let waterCapitalYeaW = 0, waterCapitalTotalW = 0, waterCapitalCount = 0;
		let workerPeopleYeaW = 0, workerPeopleTotalW = 0, workerPeopleCount = 0;
		let workerCapitalYeaW = 0, workerCapitalTotalW = 0, workerCapitalCount = 0;

		for (const v of myVotes) {
			const billData = bills.find(b => b.id === v.bill_id);
			if (!billData?.ai_tags) continue;
			const tags = billData.ai_tags;
			const isWaterEnv = tags.includes('water') || tags.includes('environment');
			const isWorker = tags.includes('workers');
			const bw = getWeight(billData);

			if (billData.ai_alignment === 'for_people') {
				if (isWaterEnv) { waterPeopleCount++; waterPeopleTotalW += bw; if (v.vote_value === 1) waterPeopleYeaW += bw; }
				if (isWorker) { workerPeopleCount++; workerPeopleTotalW += bw; if (v.vote_value === 1) workerPeopleYeaW += bw; }
			} else if (billData.ai_alignment === 'for_capital') {
				if (isWaterEnv) { waterCapitalCount++; waterCapitalTotalW += bw; if (v.vote_value === 1) waterCapitalYeaW += bw; }
				if (isWorker) { workerCapitalCount++; workerCapitalTotalW += bw; if (v.vote_value === 1) workerCapitalYeaW += bw; }
			}
		}

		// Weighted badge rates: weighted Yea / weighted Total
		const waterPeopleRate = waterPeopleCount >= 5 ? waterPeopleYeaW / waterPeopleTotalW : 0;
		const waterCapitalRate = waterCapitalCount >= 5 ? waterCapitalYeaW / waterCapitalTotalW : 1;
		const workerPeopleRate = workerPeopleCount >= 5 ? workerPeopleYeaW / workerPeopleTotalW : 0;
		const workerCapitalRate = workerCapitalCount >= 5 ? workerCapitalYeaW / workerCapitalTotalW : 1;

		// ── SPONSORSHIP SCORING ──
		// Sponsoring a bill is a stronger signal than voting on it.
		// Points are added/subtracted based on bill alignment × sponsor type × impact tier.
		const mySponsorships = memberSponsorships.get(member.id) || [];
		let sponsorScore = 0;
		let maxSponsorScore = 0;

		for (const s of mySponsorships) {
			const bill = billMap.get(s.bill_id);
			if (!bill) continue; // neutral or untagged

			const sponsorW = SPONSOR_WEIGHTS[s.sponsor_type] || 1;
			const tierW = bill.weight;
			const w = sponsorW * tierW;
			maxSponsorScore += w;

			if (bill.forPeople) {
				sponsorScore += w;  // sponsoring people-first bill = good
			} else if (bill.forCapital) {
				sponsorScore -= w;  // sponsoring corporate bill = bad
			}
		}

		// Calculate combined score — vote score + sponsorship score
		let canaryScore = null;
		let canaryTier = null;

		const totalMax = maxPossibleScore + maxSponsorScore;
		const totalRaw = rawScore + sponsorScore;

		if (scoredVoteCount >= MIN_SCORED_VOTES && totalMax > 0) {
			// totalRaw ranges from -totalMax to +totalMax
			// Normalize to 0-100
			canaryScore = Math.round(((totalRaw + totalMax) / (2 * totalMax)) * 100);
			canaryScore = Math.min(100, Math.max(0, canaryScore));
			canaryTier = getTier(canaryScore).tier;
		}

		// Calculate badges
		const badges = [];

		if (crossPartyPeopleCount >= 3) badges.push('lone-canary');
		if (totalVotesAll > 0 && (nvAbsentAll / totalVotesAll) > 0.25) badges.push('ghost');
		if (forCapitalVoteTotal > 0 && (forCapitalYeaTotal / forCapitalVoteTotal) >= 0.9) badges.push('corporate-friend');
		if (totalScoredRollCalls > 0 && (partyAlignCount / totalScoredRollCalls) >= 0.95) badges.push('lockstep');
		// Water Protector: high Yea rate on for_people water/env bills AND low Yea rate on for_capital ones
		// Must have voted on enough bills in both categories to show a real pattern
		if (waterPeopleRate >= 0.8 && waterCapitalRate <= 0.5 && waterPeopleCount >= 5) {
			badges.push('water-protector');
		}
		// Friend of Worker: same logic for worker bills
		if (workerPeopleRate >= 0.8 && workerCapitalRate <= 0.5 && workerPeopleCount >= 5) {
			badges.push('friend-of-worker');
		}

		results.push({
			id: member.id,
			full_name: member.full_name,
			party: member.party,
			canary_score: canaryScore,
			canary_tier: canaryTier,
			canary_badges: badges,
			canary_votes_scored: scoredVoteCount
		});
	}

	// 6. Write scores to DB
	let written = 0;
	for (const r of results) {
		await supabasePatch('members', r.id, {
			canary_score: r.canary_score,
			canary_tier: r.canary_tier,
			canary_badges: `{${r.canary_badges.join(',')}}`,
			canary_votes_scored: r.canary_votes_scored,
			canary_score_updated_at: new Date().toISOString()
		});
		written++;
	}

	// 7. Display results
	const scored = results.filter(r => r.canary_score !== null).sort((a, b) => b.canary_score - a.canary_score);
	const unscored = results.filter(r => r.canary_score === null);

	console.log(`\u2705 Scores written for ${written} members (${scored.length} scored, ${unscored.length} unscored)\n`);

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

		// Badge summary
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

	const duration = Date.now() - startTime;
	const secs = Math.floor(duration / 1000);
	console.log(`\nDuration: ${secs}s`);
}

run().catch(err => {
	console.error('\n\u274C Score calculation failed:', err.message);
	process.exit(1);
});
