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
	getBillWeight
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

function run({ bills = [], votes = [], members, sponsorships = [], priorScores }) {
	return scoreMembers({ bills, votes, members, sponsorships, priorScores });
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
	// for_capital bill (w5, -5): raw 14, max 24
	// score = round((14 + 24) / 48 * 100) = round(79.17) = 79 → tier 2
	const people = makeBills(19, { alignment: 'for_people' });
	const landmark = makeBills(1, { alignment: 'for_capital', impactTier: 1, startId: 500 });
	const votes = [...votesFor(1, people, 1), ...votesFor(1, landmark, 1)];
	const [r] = run({ bills: [...people, ...landmark], votes, members: [MEMBER] });
	assert.equal(r.canary_score, 79);
	assert.equal(r.canary_tier, 2);
});

test('primary sponsorship of a corporate landmark bill drags the score down', () => {
	// Perfect voting record (raw 20 / max 20) + primary sponsor (3x) of a
	// landmark (5x) for_capital bill: sponsor -15 / maxSponsor 15
	// score = round((5 + 35) / 70 * 100) = round(57.14) = 57 → tier 3
	const people = makeBills(20, { alignment: 'for_people' });
	const landmark = makeBills(1, { alignment: 'for_capital', impactTier: 1, startId: 500 });
	const [r] = run({
		bills: [...people, ...landmark],
		votes: votesFor(1, people, 1),
		members: [MEMBER],
		sponsorships: [{ member_id: 1, bill_id: 500, sponsor_type: 1 }]
	});
	assert.equal(r.canary_score, 57);
	assert.equal(r.canary_tier, 3);
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
	assert.equal(getBillWeight(overridden), 5); // landmark weight now applies
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
	const people = makeBills(2, { alignment: 'for_people', impactTier: 1 }); // weight 5 each
	const capital = makeBills(1, { alignment: 'for_capital', impactTier: 4, startId: 50 }); // weight 1
	const votes = [
		...votesFor(1, people, 1), // +5, +5
		...votesFor(1, capital, 1) // -1 (Yea on a corporate bill)
	];
	const { items, totals } = explainMemberScore({ memberId: 1, bills: [...people, ...capital], votes });
	assert.equal(items.length, 3);
	assert.equal(totals.people_yea, 2);
	assert.equal(totals.capital_yea, 1);
	assert.equal(totals.vote_points, 9); // 5 + 5 - 1
	// Sorted by magnitude — the landmark votes come first
	assert.equal(Math.abs(items[0].points), 5);
});
