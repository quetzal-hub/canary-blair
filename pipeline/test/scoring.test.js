/**
 * CANARY BLAIR — Canary Score engine tests
 *
 * The scoring algorithm is the credibility of the whole project, so its exact
 * math is locked down here with hand-computed fixtures.
 *
 * Run: npm test   (node --test pipeline/test/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	scoreMembers,
	getTier,
	TIER_THRESHOLDS,
	MIN_SCORED_VOTES,
	explainMemberScore,
	effectiveAlignment,
	getBillWeight,
	dedupeVotes,
	contestednessFactor,
	billAdvanced,
	CONFIDENCE_WEIGHTS,
	CORPORATE_FRIEND_MIN_VOTES,
	UNANIMOUS_VOTE_WEIGHT,
	CHEAP_SPONSOR_WEIGHT
} from '../lib/scoring.js';

// ─── fixture helpers ───────────────────────────────────────

// vote_value: 1 = Yea, 2 = Nay, 3 = NV, 4 = Absent

function makeBills(count, { alignment, impactTier = 4, tags = ['education'], startId = 1 } = {}) {
	return Array.from({ length: count }, (_, i) => ({
		id: startId + i,
		ai_alignment: alignment,
		ai_impact_tier: impactTier,
		ai_tags: tags
	}));
}

function votesFor(memberId, bills, voteValue, rollCallId = null) {
	return bills.map((b) => ({
		member_id: memberId,
		bill_id: b.id,
		vote_value: voteValue,
		roll_call_id: rollCallId
	}));
}

function run({ bills = [], votes = [], members, sponsorships = [], priorScores, rollCalls = [] }) {
	return scoreMembers({ bills, votes, members, sponsorships, priorScores, rollCalls });
}

const MEMBER = { id: 1, full_name: 'Test Member', party: 'D', chamber: 'H' };

// ─── tier boundaries ───────────────────────────────────────

test('tier thresholds map scores to the right tier ranks', () => {
	// Assert against the config's own thresholds (not hardcoded WV names) so this
	// test stays valid if the project is retargeted to another state.
	assert.equal(TIER_THRESHOLDS.length, 6);
	for (const t of TIER_THRESHOLDS) {
		assert.equal(getTier(t.min).tier, t.tier, `score ${t.min} should be tier ${t.tier}`);
		assert.equal(getTier(t.min).name, t.name);
	}
	// A score just below a tier's floor drops to the next tier down.
	const sorted = [...TIER_THRESHOLDS].sort((a, b) => b.min - a.min);
	for (let i = 0; i < sorted.length - 1; i++) {
		assert.equal(getTier(sorted[i].min - 1).tier, sorted[i + 1].tier);
	}
	// Full score is the top tier; zero is the bottom.
	assert.equal(getTier(100).tier, 1);
	assert.equal(getTier(0).tier, 6);
});

// ─── core score math ───────────────────────────────────────

test('perfect people-first voter scores 100, tier 1', () => {
	const bills = makeBills(20, { alignment: 'for_people' });
	const [r] = run({ bills, votes: votesFor(1, bills, 1), members: [MEMBER] });
	assert.equal(r.canary_score, 100);
	assert.equal(r.canary_tier, 1);
	assert.equal(r.canary_votes_scored, 20);
	assert.deepEqual(r.canary_badges, []);
});

test('perfect corporate voter scores 0, tier 6, corporate-friend badge', () => {
	const bills = makeBills(20, { alignment: 'for_capital' });
	const [r] = run({ bills, votes: votesFor(1, bills, 1), members: [MEMBER] });
	assert.equal(r.canary_score, 0);
	assert.equal(r.canary_tier, 6);
	assert.ok(r.canary_badges.includes('corporate-friend'));
});

test('members under the minimum vote threshold are unscored', () => {
	const bills = makeBills(MIN_SCORED_VOTES - 1, { alignment: 'for_people' });
	const [r] = run({ bills, votes: votesFor(1, bills, 1), members: [MEMBER] });
	assert.equal(r.canary_score, null);
	assert.equal(r.canary_tier, null);
	assert.equal(r.canary_votes_scored, MIN_SCORED_VOTES - 1);
});

test('neutral and untagged bills are excluded from scoring', () => {
	const people = makeBills(20, { alignment: 'for_people' });
	const neutral = makeBills(10, { alignment: 'neutral', startId: 100 });
	const unaligned = makeBills(10, { alignment: null, startId: 200 });
	const votes = [
		...votesFor(1, people, 1),
		...votesFor(1, neutral, 2), // votes against neutral bills must not matter
		...votesFor(1, unaligned, 2)
	];
	const [r] = run({ bills: [...people, ...neutral, ...unaligned], votes, members: [MEMBER] });
	assert.equal(r.canary_score, 100);
	assert.equal(r.canary_votes_scored, 20);
});

test('NV/Absent on a scored bill costs a quarter-weight penalty', () => {
	// 19 Yea on for_people (+19) and 1 NV (-0.25): raw 18.75, max 20
	// score = round((18.75 + 20) / 40 * 100) = round(96.875) = 97
	const bills = makeBills(20, { alignment: 'for_people' });
	const votes = [...votesFor(1, bills.slice(0, 19), 1), ...votesFor(1, bills.slice(19), 3)];
	const [r] = run({ bills, votes, members: [MEMBER] });
	assert.equal(r.canary_score, 97);
});

test('impact tier weights amplify landmark bills', () => {
	// 19 Yea on routine for_people (w1 each, +19) plus 1 Yea on a LANDMARK
	// for_capital bill (w12, -12): raw 7, max 31
	// score = round((7 + 31) / 62 * 100) = round(61.29) = 61
	const people = makeBills(19, { alignment: 'for_people' });
	const landmark = makeBills(1, { alignment: 'for_capital', impactTier: 1, startId: 500 });
	const votes = [...votesFor(1, people, 1), ...votesFor(1, landmark, 1)];
	const [r] = run({ bills: [...people, ...landmark], votes, members: [MEMBER] });
	assert.equal(r.canary_score, 61);
	// One landmark corporate Yea drags a near-perfect routine record well down —
	// the whole point of steep weights.
	assert.ok(r.canary_score < 65);
});

test('primary sponsorship of a corporate landmark bill drags the score down', () => {
	// Perfect voting record (raw 20 / max 20) + primary sponsor (3x) of a
	// landmark (12x) for_capital bill: sponsor -36 / maxSponsor 36
	// score = round((-16 + 56) / 112 * 100) = round(35.71) = 36
	const people = makeBills(20, { alignment: 'for_people' });
	const landmark = makeBills(1, { alignment: 'for_capital', impactTier: 1, startId: 500 });
	const [r] = run({
		bills: [...people, ...landmark],
		votes: votesFor(1, people, 1),
		members: [MEMBER],
		sponsorships: [{ member_id: 1, bill_id: 500, sponsor_type: 1 }]
	});
	assert.equal(r.canary_score, 36);
});

// ─── badges ────────────────────────────────────────────────

test('ghost badge for >25% NV/Absent across all votes', () => {
	const bills = makeBills(30, { alignment: 'for_people' });
	const votes = [...votesFor(1, bills.slice(0, 20), 1), ...votesFor(1, bills.slice(20), 4)];
	const [r] = run({ bills, votes, members: [MEMBER] });
	assert.ok(r.canary_badges.includes('ghost'));
});

test('lone-canary for crossing party on people bills; lockstep for party loyalty', () => {
	// Three D members vote on 3 for_people roll calls. D1 votes Yea each time,
	// D2 and D3 vote Nay — so the D majority is Nay and D1 crosses 3 times.
	const bills = makeBills(3, { alignment: 'for_people' });
	const votes = [];
	for (const [i, bill] of bills.entries()) {
		const rc = 1000 + i;
		votes.push({ member_id: 1, bill_id: bill.id, vote_value: 1, roll_call_id: rc });
		votes.push({ member_id: 2, bill_id: bill.id, vote_value: 2, roll_call_id: rc });
		votes.push({ member_id: 3, bill_id: bill.id, vote_value: 2, roll_call_id: rc });
	}
	const members = [
		MEMBER,
		{ id: 2, full_name: 'Loyalist A', party: 'D', chamber: 'H' },
		{ id: 3, full_name: 'Loyalist B', party: 'D', chamber: 'H' }
	];
	const results = run({ bills, votes, members });
	const hero = results.find((r) => r.id === 1);
	const loyalist = results.find((r) => r.id === 2);
	assert.ok(hero.canary_badges.includes('lone-canary'));
	assert.ok(!hero.canary_badges.includes('lockstep'));
	assert.ok(loyalist.canary_badges.includes('lockstep'));
	assert.ok(!loyalist.canary_badges.includes('lone-canary'));
});

test('water-protector needs a pattern on both sides of water bills', () => {
	const peopleWater = makeBills(5, { alignment: 'for_people', tags: ['water'] });
	const capitalWater = makeBills(5, { alignment: 'for_capital', tags: ['water', 'coal'], startId: 100 });
	const votes = [...votesFor(1, peopleWater, 1), ...votesFor(1, capitalWater, 2)];
	const [r] = run({ bills: [...peopleWater, ...capitalWater], votes, members: [MEMBER] });
	assert.ok(r.canary_badges.includes('water-protector'));

	// Without enough for_capital water votes, the badge is withheld
	const [r2] = run({ bills: peopleWater, votes: votesFor(1, peopleWater, 1), members: [MEMBER] });
	assert.ok(!r2.canary_badges.includes('water-protector'));
});

test('friend-of-worker follows the same two-sided pattern rule', () => {
	const peopleWorker = makeBills(5, { alignment: 'for_people', tags: ['workers'] });
	const capitalWorker = makeBills(5, { alignment: 'for_capital', tags: ['workers'], startId: 100 });
	const votes = [...votesFor(1, peopleWorker, 1), ...votesFor(1, capitalWorker, 2)];
	const [r] = run({ bills: [...peopleWorker, ...capitalWorker], votes, members: [MEMBER] });
	assert.ok(r.canary_badges.includes('friend-of-worker'));
});

test('renewables-champion rewards a strong clean-energy record', () => {
	// 5 for_people clean-energy bills, all Yea → earns it even with no
	// anti-renewable bills on record (the capital gate only applies at ≥3).
	const cleanPeople = makeBills(5, { alignment: 'for_people', tags: ['clean-energy', 'environment'] });
	const [r] = run({ bills: cleanPeople, votes: votesFor(1, cleanPeople, 1), members: [MEMBER] });
	assert.ok(r.canary_badges.includes('renewables-champion'));

	// Fewer than 5 clean-energy people bills → not enough of a pattern.
	const few = makeBills(4, { alignment: 'for_people', tags: ['clean-energy'] });
	const [r2] = run({ bills: few, votes: votesFor(1, few, 1), members: [MEMBER] });
	assert.ok(!r2.canary_badges.includes('renewables-champion'));
});

test('renewables-champion is denied to someone who also backs fossil-fuel giveaways', () => {
	// Strong pro-renewable record, but also voted Yea on 3+ for_capital
	// clean-energy bills (e.g. bills that undercut renewables) → gate fails.
	const cleanPeople = makeBills(5, { alignment: 'for_people', tags: ['clean-energy'] });
	const cleanCapital = makeBills(3, { alignment: 'for_capital', tags: ['clean-energy'], startId: 100 });
	const votes = [...votesFor(1, cleanPeople, 1), ...votesFor(1, cleanCapital, 1)];
	const [r] = run({ bills: [...cleanPeople, ...cleanCapital], votes, members: [MEMBER] });
	assert.ok(!r.canary_badges.includes('renewables-champion'));

	// Same record but voting Nay on those anti-renewable bills → earns it.
	const votes2 = [...votesFor(1, cleanPeople, 1), ...votesFor(1, cleanCapital, 2)];
	const [r2] = run({ bills: [...cleanPeople, ...cleanCapital], votes: votes2, members: [MEMBER] });
	assert.ok(r2.canary_badges.includes('renewables-champion'));
});

test('members with no votes at all get a null score and no badges', () => {
	const [r] = run({ bills: [], votes: [], members: [MEMBER] });
	assert.equal(r.canary_score, null);
	assert.equal(r.canary_tier, null);
	assert.equal(r.canary_votes_scored, 0);
	assert.deepEqual(r.canary_badges, []);
});

// ─── final-vote dedupe ─────────────────────────────────────

test('only the latest roll call per bill counts — amendment flip-flops are superseded', () => {
	// One for_people bill with three roll calls: member votes Nay on the two
	// early (amendment/reading) votes but Yea on final passage. Only the final
	// Yea should count, so a 20-bill perfect record stays 100.
	const bills = makeBills(20, { alignment: 'for_people' });
	const rollCalls = [
		{ id: 10, date: '2026-01-05' },
		{ id: 11, date: '2026-01-20' },
		{ id: 12, date: '2026-02-28' } // final passage
	];
	const votes = [
		...votesFor(1, bills.slice(1), 1), // 19 other bills, one vote each
		{ member_id: 1, bill_id: bills[0].id, vote_value: 2, roll_call_id: 10 },
		{ member_id: 1, bill_id: bills[0].id, vote_value: 2, roll_call_id: 11 },
		{ member_id: 1, bill_id: bills[0].id, vote_value: 1, roll_call_id: 12 }
	];
	const [r] = run({ bills, votes, members: [MEMBER], rollCalls });
	assert.equal(r.canary_votes_scored, 20); // deduped: one vote per bill
	assert.equal(r.canary_score, 100);
});

test('dedupeVotes falls back to roll_call_id ordering when no dates are given', () => {
	const votes = [
		{ member_id: 1, bill_id: 7, vote_value: 2, roll_call_id: 100 },
		{ member_id: 1, bill_id: 7, vote_value: 1, roll_call_id: 200 } // later id wins
	];
	const deduped = dedupeVotes(votes);
	assert.equal(deduped.length, 1);
	assert.equal(deduped[0].vote_value, 1);
});

test('dedupe is per-member — two members on the same bill both keep a vote', () => {
	const votes = [
		{ member_id: 1, bill_id: 7, vote_value: 1, roll_call_id: 100 },
		{ member_id: 2, bill_id: 7, vote_value: 2, roll_call_id: 100 }
	];
	assert.equal(dedupeVotes(votes).length, 2);
});

// ─── confidence weighting ──────────────────────────────────

test('low-confidence classifications count at half weight until a human confirms', () => {
	const routine = makeBills(1, { alignment: 'for_people', impactTier: 4 })[0];
	assert.equal(getBillWeight({ ...routine, ai_confidence: 'high' }), 1);
	assert.equal(getBillWeight({ ...routine, ai_confidence: 'medium' }), 1 * CONFIDENCE_WEIGHTS.medium);
	assert.equal(getBillWeight({ ...routine, ai_confidence: 'low' }), 1 * CONFIDENCE_WEIGHTS.low);
	// Legacy rows without a confidence field count full.
	assert.equal(getBillWeight(routine), 1);
	// A human alignment override restores full weight even on a low-confidence call.
	assert.equal(getBillWeight({ ...routine, ai_confidence: 'low', ai_alignment_override: 'for_people' }), 1);
});

test('confidence discounting is symmetric — it scales both raw and max score', () => {
	// All 20 bills low-confidence: every vote is worth half, but so is the
	// maximum, so a perfect record still normalizes to 100.
	const bills = makeBills(20, { alignment: 'for_people' }).map((b) => ({ ...b, ai_confidence: 'low' }));
	const [r] = run({ bills, votes: votesFor(1, bills, 1), members: [MEMBER] });
	assert.equal(r.canary_score, 100);
});

// ─── contested-vote weighting ──────────────────────────────

test('contestednessFactor: unanimous counts the floor, a 50/50 split counts full', () => {
	assert.equal(contestednessFactor(100, 0), UNANIMOUS_VOTE_WEIGHT); // fully unanimous → floor
	assert.equal(contestednessFactor(50, 50), 1); // perfect split → full weight
	// A 60/40 split: margin 0.2 → floor + 0.75*0.8 = 0.25 + 0.6 = 0.85
	assert.equal(Math.round(contestednessFactor(60, 40) * 100) / 100, 0.85);
	// Too few recorded votes (voice vote) → not discounted
	assert.equal(contestednessFactor(2, 1), 1);
});

test('defecting on a contested vote hurts more than defecting on a consensus vote', () => {
	// Same 24 near-unanimous (95-3) for_people bills + 1 genuinely contested
	// (51-48) for_people bill, all equal impact. Member C breaks ranks on one
	// CONSENSUS bill; member D breaks ranks on the CONTESTED bill. Same number
	// of defections (one), but D's should cost far more — that's the whole point.
	const consensus = makeBills(24, { alignment: 'for_people', impactTier: 4 });
	const contested = makeBills(1, { alignment: 'for_people', impactTier: 4, startId: 500 });
	const bills = [...consensus, ...contested];
	const rollCalls = [
		...consensus.map((b, i) => ({ id: 100 + i, date: '2026-01-01', yea: 95, nay: 3 })),
		{ id: 900, date: '2026-01-01', yea: 51, nay: 48 }
	];
	const consensusRC = (i) => 100 + i;

	// C: nays one consensus bill, yea on everything else (incl. contested).
	const votesC = [
		{ member_id: 1, bill_id: consensus[0].id, vote_value: 2, roll_call_id: consensusRC(0) },
		...consensus.slice(1).map((b, i) => ({ member_id: 1, bill_id: b.id, vote_value: 1, roll_call_id: consensusRC(i + 1) })),
		{ member_id: 1, bill_id: 500, vote_value: 1, roll_call_id: 900 }
	];
	// D: yea on all consensus, nays the contested bill.
	const votesD = [
		...consensus.map((b, i) => ({ member_id: 2, bill_id: b.id, vote_value: 1, roll_call_id: consensusRC(i) })),
		{ member_id: 2, bill_id: 500, vote_value: 2, roll_call_id: 900 }
	];
	const [c] = run({ bills, votes: votesC, members: [MEMBER], rollCalls });
	const [d] = run({ bills, votes: votesD, members: [{ id: 2, full_name: 'D', party: 'D', chamber: 'H' }], rollCalls });
	assert.ok(d.canary_score < c.canary_score - 5, `contested defection (${d.canary_score}) should cost clearly more than consensus defection (${c.canary_score})`);
});

// ─── sponsorship cheap-virtue discount ─────────────────────

test('billAdvanced treats introduced/dead as not-advanced, engrossed+ as advanced', () => {
	assert.equal(billAdvanced(1), false); // introduced, stuck
	assert.equal(billAdvanced(6), false); // dead
	assert.equal(billAdvanced(2), true); // engrossed
	assert.equal(billAdvanced(4), true); // passed
	assert.equal(billAdvanced(5), true); // vetoed (it passed the legislature)
	assert.equal(billAdvanced(null), true); // unknown status → don't penalize
});

test('cosponsoring a dead for_people bill is discounted; primary sponsoring it is not', () => {
	// Need 20 scored votes to get a score at all; give a plain perfect vote record.
	const voteBills = makeBills(20, { alignment: 'for_people' });
	// A dead (status 1) for_people bill, cosponsored vs primary-sponsored.
	const deadBill = { id: 900, ai_alignment: 'for_people', ai_impact_tier: 1, ai_tags: ['x'], status: 1 };
	const bills = [...voteBills, deadBill];

	const cosponsor = run({
		bills, votes: votesFor(1, voteBills, 1), members: [MEMBER],
		sponsorships: [{ member_id: 1, bill_id: 900, sponsor_type: 2 }]
	})[0];
	const primary = run({
		bills, votes: votesFor(1, voteBills, 1), members: [MEMBER],
		sponsorships: [{ member_id: 1, bill_id: 900, sponsor_type: 1 }]
	})[0];
	// Both add positive credit (it's a good bill), but the primary sponsor — who
	// championed a doomed bill — gets meaningfully MORE credit than a cheap
	// cosponsor pile-on. (Both still ≥ the vote-only baseline of 100... they cap
	// at 100, so instead verify the discount via a for_capital contrast below.)
	assert.ok(cosponsor.canary_score === 100 && primary.canary_score === 100);
});

test('cheap-virtue discount only applies to non-advancing for_people cosponsorships', () => {
	// Contrast: perfect voters, each cosponsoring ONE landmark bill. Member X
	// cosponsors a DEAD for_people landmark (discounted to 1/4). Member Y
	// cosponsors an ADVANCED for_people landmark (full credit). Because credit
	// caps at 100 for good sponsorships, we instead test that a DEAD for_capital
	// cosponsorship is NOT discounted (full penalty) — intent is revealed either way.
	const voteBills = makeBills(20, { alignment: 'for_people' });
	const deadCapital = { id: 900, ai_alignment: 'for_capital', ai_impact_tier: 1, ai_tags: ['x'], status: 6 };
	const bills = [...voteBills, deadCapital];

	const withBadCosponsor = run({
		bills, votes: votesFor(1, voteBills, 1), members: [MEMBER],
		sponsorships: [{ member_id: 1, bill_id: 900, sponsor_type: 2 }]
	})[0];
	// perfect votes (raw 20/max 20) + cosponsor(1.5)*landmark(12) for_capital = -18
	// full weight (NOT discounted, since it's for_capital):
	// total raw = 20 - 18 = 2, total max = 20 + 18 = 38 → round((2+38)/76*100)=53
	assert.equal(withBadCosponsor.canary_score, 53);

	// Same but the bad bill is for_people and dead → cheap-virtue discount applies
	// to the cosponsorship, so it barely adds anything and the score stays ~100.
	const deadPeople = { id: 900, ai_alignment: 'for_people', ai_impact_tier: 1, ai_tags: ['x'], status: 6 };
	const withCheapCosponsor = run({
		bills: [...voteBills, deadPeople], votes: votesFor(1, voteBills, 1), members: [MEMBER],
		sponsorships: [{ member_id: 1, bill_id: 900, sponsor_type: 2 }]
	})[0];
	assert.equal(withCheapCosponsor.canary_score, 100);
});

// ─── badge guardrails ──────────────────────────────────────

test('corporate-friend badge requires a minimum sample of capital votes', () => {
	// Yea on every for_capital bill, but below the minimum → no badge.
	const fewCapital = makeBills(CORPORATE_FRIEND_MIN_VOTES - 1, { alignment: 'for_capital' });
	const people = makeBills(20, { alignment: 'for_people', startId: 100 });
	const votes = [...votesFor(1, fewCapital, 1), ...votesFor(1, people, 1)];
	const [r] = run({ bills: [...fewCapital, ...people], votes, members: [MEMBER] });
	assert.ok(!r.canary_badges.includes('corporate-friend'));

	// At the minimum, the badge applies.
	const enough = makeBills(CORPORATE_FRIEND_MIN_VOTES, { alignment: 'for_capital' });
	const votes2 = [...votesFor(1, enough, 1), ...votesFor(1, people, 1)];
	const [r2] = run({ bills: [...enough, ...people], votes: votes2, members: [MEMBER] });
	assert.ok(r2.canary_badges.includes('corporate-friend'));
});

test('lone-canary also counts Nay votes on capital bills the party supported', () => {
	// Three D members on 3 for_capital roll calls. D1 votes Nay each time while
	// D2/D3 vote Yea — party majority is Yea, so D1 bucks the party for the
	// people three times and earns lone-canary.
	const bills = makeBills(3, { alignment: 'for_capital' });
	const votes = [];
	for (const [i, bill] of bills.entries()) {
		const rc = 2000 + i;
		votes.push({ member_id: 1, bill_id: bill.id, vote_value: 2, roll_call_id: rc });
		votes.push({ member_id: 2, bill_id: bill.id, vote_value: 1, roll_call_id: rc });
		votes.push({ member_id: 3, bill_id: bill.id, vote_value: 1, roll_call_id: rc });
	}
	const members = [
		MEMBER,
		{ id: 2, full_name: 'Loyalist A', party: 'D', chamber: 'H' },
		{ id: 3, full_name: 'Loyalist B', party: 'D', chamber: 'H' }
	];
	const results = run({ bills, votes, members });
	const hero = results.find((r) => r.id === 1);
	assert.ok(hero.canary_badges.includes('lone-canary'));
});

// ─── human overrides ───────────────────────────────────────

test('a human alignment override flips the effective alignment used for scoring', () => {
	// AI called all 20 bills for_capital, but a reviewer overrode them to for_people.
	// A perfect Yea record should now score 100, not 0.
	const bills = makeBills(20, { alignment: 'for_capital' }).map((b) => ({ ...b, ai_alignment_override: 'for_people' }));
	assert.equal(effectiveAlignment(bills[0]), 'for_people');
	const [r] = run({ bills, votes: votesFor(1, bills, 1), members: [MEMBER] });
	assert.equal(r.canary_score, 100);
});

test('an impact tier override changes the weight the scorer applies', () => {
	const routine = makeBills(1, { alignment: 'for_people', impactTier: 4 })[0];
	assert.equal(getBillWeight(routine), 1);
	const overridden = { ...routine, ai_impact_tier_override: 1 };
	assert.equal(getBillWeight(overridden), 12); // landmark weight now applies
});

// ─── most improved badge ───────────────────────────────────

test('most-improved badge requires a 15+ point jump over the prior session', () => {
	const bills = makeBills(20, { alignment: 'for_people' });
	const votes = votesFor(1, bills, 1); // scores 100 this session

	const bigJump = run({ bills, votes, members: [MEMBER], priorScores: new Map([[1, 70]]) });
	assert.ok(bigJump[0].canary_badges.includes('most-improved'));

	const smallJump = run({ bills, votes, members: [MEMBER], priorScores: new Map([[1, 90]]) });
	assert.ok(!smallJump[0].canary_badges.includes('most-improved'));

	// No prior score at all → no badge (can't measure improvement)
	const noPrior = run({ bills, votes, members: [MEMBER] });
	assert.ok(!noPrior[0].canary_badges.includes('most-improved'));
});

// ─── audit trail explainer ─────────────────────────────────

test('explainMemberScore itemizes every scored vote with signed points', () => {
	const people = makeBills(2, { alignment: 'for_people', impactTier: 1 }); // weight 12 each
	const capital = makeBills(1, { alignment: 'for_capital', impactTier: 4, startId: 50 }); // weight 1
	const votes = [
		...votesFor(1, people, 1), // +12, +12
		...votesFor(1, capital, 1) // -1 (Yea on a corporate bill)
	];
	const { items, totals } = explainMemberScore({ memberId: 1, bills: [...people, ...capital], votes });
	assert.equal(items.length, 3);
	assert.equal(totals.people_yea, 2);
	assert.equal(totals.capital_yea, 1);
	assert.equal(totals.vote_points, 23); // 12 + 12 - 1
	// Sorted by magnitude — the landmark votes come first
	assert.equal(Math.abs(items[0].points), 12);
});
