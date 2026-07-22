/**
 * CANARY BLAIR — Shared Canary Score engine
 *
 * Single source of truth for tier config, badge rules, and the scoring
 * algorithm. Imported by:
 *   - pipeline/score.js       (local CLI runner)
 *   - pipeline/ai-worker.js   (Cloudflare Worker, cron + HTTP)
 *   - pipeline/test/scoring.test.js
 *
 * scoreMembers() is a pure function — no I/O — so the algorithm is unit
 * testable and cannot drift between the CLI and the deployed worker.
 *
 * Tier names/taglines come from lib/state-config.js so the project can be
 * retargeted to another state without touching this file.
 */
import { STATE_CONFIG } from './state-config.js';

// ─────────────────────────────────────────
// BILL IMPACT TIER WEIGHTS
// ─────────────────────────────────────────
// Each bill has an impact tier (1-6). Higher-impact bills weigh more.

// Steep on purpose: a handful of landmark bills define a session far more than
// a pile of routine ones, so a landmark counts 12× a routine bill and ~120× a
// ceremonial resolution. Flatter weights let a mass of small feel-good votes
// arithmetically wash out a few enormous harms — which is exactly how a
// legislature games an accountability score. (See also fiscal-capacity reasoning
// in the classification prompt.)
export const TIER_WEIGHTS = {
	1: 12, // Landmark — transformative structural change
	2: 6, // High Impact — significant real-world consequences
	3: 2.5, // Meaningful — clear but narrower scope
	4: 1, // Routine — standard legislation
	5: 0.4, // Minor — procedural tweaks
	6: 0.1 // Ceremonial — symbolic, no policy impact
};

// Sponsoring a bill is a stronger signal than voting on it.
export const SPONSOR_WEIGHTS = {
	1: 3, // Primary sponsor — you wrote or championed it
	2: 1.5 // Cosponsor — you signed on in support
};

// Contested-vote weighting. Most votes in a session are near-unanimous consensus
// bills; a yea shared with 95% of the chamber reveals almost nothing about a
// legislator, while a vote on a 55-45 split reveals a great deal. Each vote's
// score weight scales with how divided its roll call was, so the handful of
// genuinely contested votes — where character actually shows — aren't drowned out
// by the consensus mass. A unanimous vote still counts UNANIMOUS_VOTE_WEIGHT of a
// coin-flip vote of the same impact (not zero: showing up and voting right is
// mildly positive), rising linearly to full weight at a perfect 50/50 split.
export const UNANIMOUS_VOTE_WEIGHT = 0.25;

export function contestednessFactor(yea, nay) {
	const total = (yea || 0) + (nay || 0);
	if (total < 5) return 1; // too few recorded (voice vote / thin data) — don't discount
	const margin = Math.abs((yea || 0) - (nay || 0)) / total; // 0 = perfectly split, 1 = unanimous
	return UNANIMOUS_VOTE_WEIGHT + (1 - UNANIMOUS_VOTE_WEIGHT) * (1 - margin);
}

// Cosponsoring a for_people bill that never advanced past committee is a nearly
// free "virtue signal" — dozens of legislators pile onto a doomed feel-good bill
// at no cost. That cheap signal is discounted to CHEAP_SPONSOR_WEIGHT. Primary
// sponsorship (you championed it), ANY for_capital sponsorship (your name on a
// harmful bill reveals intent regardless of outcome), and any bill that actually
// advanced past committee all keep full weight.
export const CHEAP_SPONSOR_WEIGHT = 0.25;

// A bill "advanced" if it got past its first committee — engrossed (2), enrolled
// (3), passed (4), or vetoed (5, meaning it passed the legislature). Introduced-
// and-stuck (1) or dead (6) did not advance.
const ADVANCED_STATUSES = new Set([2, 3, 4, 5]);
export function billAdvanced(status) {
	return status == null ? true : ADVANCED_STATUSES.has(status);
}

// Some roll calls are tangled procedural motions (motion to table the motion to
// discharge, take-from-the-table, previous-question, bare reconsider) whose
// yea/nay direction relative to the bill's merits is genuinely ambiguous. They
// must NOT become a member's scored vote on the bill — a "yea to table a
// discharge motion" is not a clean position on the policy. We exclude them so
// the scored vote falls back to the actual passage vote. A "reconsidered AND
// passed" description is a real passage, not a procedural motion — hence the guard.
export function isProceduralMotion(description) {
	const d = description || '';
	if (/passed\s+(bill|the|house|senate)/i.test(d)) return false;
	return /motion to table|motion to discharge|take from the table|previous motion|postpone indefinitely|motion to reconsider/i.test(d);
}

// AI classification confidence scales a bill's weight: an uncertain call moves
// scores less until a human confirms it. A human alignment override restores
// full weight (the human judgment supersedes the AI's uncertainty).
export const CONFIDENCE_WEIGHTS = {
	high: 1,
	medium: 0.75,
	low: 0.5
};

// The corporate-friend label is the harshest badge — require a real sample
// before hanging it on anyone (other badges require ≥5; this one ≥10).
export const CORPORATE_FRIEND_MIN_VOTES = 10;

export const TIER_THRESHOLDS = STATE_CONFIG.tiers;

export const TIER_NAMES = Object.fromEntries(TIER_THRESHOLDS.map((t) => [t.tier, t.name]));

export const BADGE_NAMES = {
	'water-protector': 'Water Protector',
	'friend-of-worker': 'Friend of the Worker',
	'renewables-champion': 'Renewables Champion (votes for clean energy, against fossil-fuel giveaways)',
	'lone-canary': 'Lone Canary (votes against own party for the people)',
	'corporate-friend': "Never Met a Corporation They Didn't Like",
	'most-improved': 'Most Improved (score up 15+ since last session)',
	lockstep: 'Lockstep (votes with party 95%+)',
	ghost: 'Ghost (absent/not voting 25%+)'
};

export const MIN_SCORED_VOTES = 20;

// Score jump (points) required for the Most Improved badge.
export const MOST_IMPROVED_DELTA = 15;

// ─────────────────────────────────────────
// EFFECTIVE (post-override) BILL VALUES
// ─────────────────────────────────────────
// A human reviewer can override the AI's alignment/impact classification on a
// specific bill (see schema/008). The scorer always uses the effective value.

export function effectiveAlignment(bill) {
	return bill.ai_alignment_override ?? bill.ai_alignment ?? null;
}

export function effectiveImpactTier(bill) {
	return bill.ai_impact_tier_override ?? bill.ai_impact_tier ?? null;
}

export function isReviewed(bill) {
	return bill.ai_alignment_override != null || bill.ai_impact_tier_override != null;
}

export function getBillWeight(bill) {
	const tier = effectiveImpactTier(bill);
	const tierWeight = tier && TIER_WEIGHTS[tier] !== undefined ? TIER_WEIGHTS[tier] : 1;
	// Confidence scaling: a human alignment override restores full weight;
	// otherwise low/medium AI confidence discounts the bill. Legacy rows with
	// no ai_confidence count full (they predate the confidence field).
	const confidence =
		bill.ai_alignment_override != null ? 1 : (CONFIDENCE_WEIGHTS[bill.ai_confidence] ?? 1);
	return tierWeight * confidence;
}

/**
 * Collapse each member's votes to ONE per bill — their vote on the latest roll
 * call (final passage supersedes committee, reading, and amendment votes).
 * Without this, a bill with four roll calls counts 4× as much as an identical
 * bill with one, and a Nay on a hostile amendment reads as a Nay on the bill.
 *
 * Ordering: roll call date (via the rollCalls rows), tie-broken by roll_call_id
 * (LegiScan ids increase over time). Falls back to roll_call_id alone if no
 * rollCalls provided. Members vote only in their own chamber, so per-member
 * "latest" is inherently chamber-correct.
 */
export function dedupeVotes(votes, rollCalls = []) {
	const rcDate = new Map();
	for (const rc of rollCalls) rcDate.set(rc.id, rc.date || '');

	const later = (a, b) => {
		const da = rcDate.get(a.roll_call_id) || '';
		const db = rcDate.get(b.roll_call_id) || '';
		if (da !== db) return da > db ? a : b;
		return (a.roll_call_id || 0) >= (b.roll_call_id || 0) ? a : b;
	};

	const kept = new Map(); // "member|bill" → vote row
	for (const v of votes) {
		const key = `${v.member_id}|${v.bill_id}`;
		const prev = kept.get(key);
		kept.set(key, prev ? later(v, prev) : v);
	}
	return [...kept.values()];
}

export function getTier(score) {
	for (const t of TIER_THRESHOLDS) {
		if (score >= t.min) return t;
	}
	return TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
}

/**
 * Points a single vote contributes, given the bill's effective alignment and
 * weight. Positive = helped the score, negative = hurt it. Shared by the
 * scorer and the audit-trail explainer so the two can never disagree.
 */
export function votePoints({ forPeople, forCapital, weight, voteValue }) {
	if (forPeople) {
		if (voteValue === 1) return weight; // Yea on a people bill
		if (voteValue === 2) return -weight; // Nay on a people bill
		return -weight * 0.25; // didn't show up
	}
	if (forCapital) {
		if (voteValue === 1) return -weight; // Yea on a corporate bill
		if (voteValue === 2) return weight; // Nay on a corporate bill
		return -weight * 0.25;
	}
	return 0;
}

/**
 * Classify bills into a Map of bill_id → { forPeople, forCapital, weight, tags }.
 * Neutral and unaligned bills are excluded (they don't affect scores).
 */
export function buildBillMap(bills) {
	const billMap = new Map();
	for (const bill of bills) {
		const alignment = effectiveAlignment(bill);
		if (!alignment || alignment === 'neutral') continue;
		billMap.set(bill.id, {
			forPeople: alignment === 'for_people',
			forCapital: alignment === 'for_capital',
			weight: getBillWeight(bill),
			advanced: billAdvanced(bill.status),
			tags: bill.ai_tags || []
		});
	}
	return billMap;
}

/**
 * Pure scoring function.
 *
 * @param {object} input
 * @param {Array}  input.bills         rows with id, ai_tags, ai_alignment[_override], ai_impact_tier[_override], ai_confidence, status
 * @param {Array}  input.votes         rows with member_id, vote_value, bill_id, roll_call_id
 * @param {Array}  input.members       rows with id, full_name, party, chamber
 * @param {Array}  input.sponsorships  rows with member_id, bill_id, sponsor_type
 * @param {Map}    [input.priorScores] member_id → previous session's canary_score (for Most Improved)
 * @param {Array}  [input.rollCalls]   rows with id, date, yea, nay — date drives final-vote dedupe; yea/nay drive contested-vote weighting
 * @returns {Array} one result per member:
 *   { id, full_name, party, canary_score, canary_tier, canary_badges, canary_votes_scored }
 */
export function scoreMembers({ bills, votes: rawVotes, members, sponsorships, priorScores, rollCalls = [] }) {
	const billMap = buildBillMap(bills);

	// Roll calls that are tangled procedural motions — excluded so they can't
	// become a member's scored vote on the bill (the actual passage vote wins).
	const proceduralIds = new Set(rollCalls.filter((rc) => isProceduralMotion(rc.description)).map((rc) => rc.id));

	// One vote per member per bill: their final-passage position (procedural motions dropped).
	const votes = dedupeVotes(rawVotes.filter((v) => !proceduralIds.has(v.roll_call_id)), rollCalls);

	const memberSponsorships = new Map();
	for (const s of sponsorships) {
		if (!memberSponsorships.has(s.member_id)) memberSponsorships.set(s.member_id, []);
		memberSponsorships.get(s.member_id).push(s);
	}

	const memberParty = new Map();
	for (const m of members) memberParty.set(m.id, m.party);

	// Full-chamber yea/nay per roll call (from LegiScan), for contested-vote weighting.
	const rcInfo = new Map();
	for (const rc of rollCalls) rcInfo.set(rc.id, { yea: rc.yea, nay: rc.nay });

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

	const memberVotes = new Map();
	for (const v of votes) {
		if (!memberVotes.has(v.member_id)) memberVotes.set(v.member_id, []);
		memberVotes.get(v.member_id).push(v);
	}

	const results = [];

	for (const member of members) {
		const myVotes = memberVotes.get(member.id) || [];

		let rawScore = 0;
		let maxPossibleScore = 0;
		let scoredVoteCount = 0;

		let totalScoredRollCalls = 0;
		let partyAlignCount = 0;
		let crossPartyPeopleCount = 0;
		let forCapitalYeaTotal = 0;
		let forCapitalVoteTotal = 0;
		const totalVotesAll = myVotes.length;
		const nvAbsentAll = myVotes.filter((v) => v.vote_value === 3 || v.vote_value === 4).length;

		let waterPeopleYeaW = 0, waterPeopleTotalW = 0, waterPeopleCount = 0;
		let waterCapitalYeaW = 0, waterCapitalTotalW = 0, waterCapitalCount = 0;
		let workerPeopleYeaW = 0, workerPeopleTotalW = 0, workerPeopleCount = 0;
		let workerCapitalYeaW = 0, workerCapitalTotalW = 0, workerCapitalCount = 0;
		let cleanPeopleYeaW = 0, cleanPeopleTotalW = 0, cleanPeopleCount = 0;
		let cleanCapitalYeaW = 0, cleanCapitalTotalW = 0, cleanCapitalCount = 0;

		for (const v of myVotes) {
			const bill = billMap.get(v.bill_id);
			if (!bill) continue; // neutral or untagged

			scoredVoteCount++;
			const w = bill.weight; // impact × confidence — drives the topic badges (consistency on a subject)
			// Score weight also folds in how contested the roll call was: a vote
			// nobody split on barely moves the number, a divided vote moves it a lot.
			const rc = rcInfo.get(v.roll_call_id);
			const sw = w * (rc ? contestednessFactor(rc.yea, rc.nay) : 1);
			maxPossibleScore += sw;
			rawScore += votePoints({ forPeople: bill.forPeople, forCapital: bill.forCapital, weight: sw, voteValue: v.vote_value });

			if (bill.forCapital) {
				forCapitalVoteTotal++;
				if (v.vote_value === 1) forCapitalYeaTotal++;
			}

			if (v.roll_call_id && member.party && (v.vote_value === 1 || v.vote_value === 2)) {
				totalScoredRollCalls++;
				const rc = rollCallPartyVotes.get(v.roll_call_id);
				if (rc && rc[member.party]) {
					const partyMajority = rc[member.party].yea > rc[member.party].nay ? 1 : 2;
					if (v.vote_value === partyMajority) partyAlignCount++;
					// Lone Canary counts BOTH directions of pro-people party-bucking:
					// Yea on a people bill your party opposed, and Nay on a capital
					// bill your party supported.
					if (bill.forPeople && v.vote_value === 1 && partyMajority === 2) crossPartyPeopleCount++;
					if (bill.forCapital && v.vote_value === 2 && partyMajority === 1) crossPartyPeopleCount++;
				}
			}

			const tags = bill.tags;
			const isWaterEnv = tags.includes('water') || tags.includes('environment');
			const isWorker = tags.includes('workers');
			const isCleanEnergy = tags.includes('clean-energy');
			if (bill.forPeople) {
				if (isWaterEnv) { waterPeopleCount++; waterPeopleTotalW += w; if (v.vote_value === 1) waterPeopleYeaW += w; }
				if (isWorker) { workerPeopleCount++; workerPeopleTotalW += w; if (v.vote_value === 1) workerPeopleYeaW += w; }
				if (isCleanEnergy) { cleanPeopleCount++; cleanPeopleTotalW += w; if (v.vote_value === 1) cleanPeopleYeaW += w; }
			} else if (bill.forCapital) {
				if (isWaterEnv) { waterCapitalCount++; waterCapitalTotalW += w; if (v.vote_value === 1) waterCapitalYeaW += w; }
				if (isWorker) { workerCapitalCount++; workerCapitalTotalW += w; if (v.vote_value === 1) workerCapitalYeaW += w; }
				if (isCleanEnergy) { cleanCapitalCount++; cleanCapitalTotalW += w; if (v.vote_value === 1) cleanCapitalYeaW += w; }
			}
		}

		const waterPeopleRate = waterPeopleCount >= 5 ? waterPeopleYeaW / waterPeopleTotalW : 0;
		const waterCapitalRate = waterCapitalCount >= 5 ? waterCapitalYeaW / waterCapitalTotalW : 1;
		const workerPeopleRate = workerPeopleCount >= 5 ? workerPeopleYeaW / workerPeopleTotalW : 0;
		const workerCapitalRate = workerCapitalCount >= 5 ? workerCapitalYeaW / workerCapitalTotalW : 1;

		// Renewables Champion. Clean-energy is a narrower category than water or
		// workers, so we require a strong pro-renewable record (≥5 for_people
		// clean-energy bills, 80%+ weighted Yea) and only apply the anti-renewable
		// gate once there are enough for_capital clean-energy votes (≥3) to judge.
		const cleanPeopleRate = cleanPeopleCount >= 5 ? cleanPeopleYeaW / cleanPeopleTotalW : 0;
		const cleanCapitalOk = cleanCapitalCount < 3 || cleanCapitalYeaW / cleanCapitalTotalW <= 0.5;

		// Sponsorship scoring
		const mySponsorships = memberSponsorships.get(member.id) || [];
		let sponsorScore = 0;
		let maxSponsorScore = 0;
		for (const s of mySponsorships) {
			const bill = billMap.get(s.bill_id);
			if (!bill) continue;
			const base = (SPONSOR_WEIGHTS[s.sponsor_type] || 1) * bill.weight;
			// Cheap-virtue discount: a cosponsor pile-on onto a for_people bill that
			// died in committee is nearly free credit. Primary sponsors, for_capital
			// sponsorships, and bills that advanced all keep full weight.
			const cheapVirtue = s.sponsor_type !== 1 && bill.forPeople && !bill.advanced;
			const w = cheapVirtue ? base * CHEAP_SPONSOR_WEIGHT : base;
			maxSponsorScore += w;
			if (bill.forPeople) sponsorScore += w;
			else if (bill.forCapital) sponsorScore -= w;
		}

		let canaryScore = null;
		let canaryTier = null;
		const totalMax = maxPossibleScore + maxSponsorScore;
		const totalRaw = rawScore + sponsorScore;
		if (scoredVoteCount >= MIN_SCORED_VOTES && totalMax > 0) {
			canaryScore = Math.round(((totalRaw + totalMax) / (2 * totalMax)) * 100);
			canaryScore = Math.min(100, Math.max(0, canaryScore));
			canaryTier = getTier(canaryScore).tier;
		}

		const badges = [];
		if (crossPartyPeopleCount >= 3) badges.push('lone-canary');
		if (totalVotesAll > 0 && nvAbsentAll / totalVotesAll > 0.25) badges.push('ghost');
		if (forCapitalVoteTotal >= CORPORATE_FRIEND_MIN_VOTES && forCapitalYeaTotal / forCapitalVoteTotal >= 0.9) badges.push('corporate-friend');
		if (totalScoredRollCalls > 0 && partyAlignCount / totalScoredRollCalls >= 0.95) badges.push('lockstep');
		if (waterPeopleRate >= 0.8 && waterCapitalRate <= 0.5 && waterPeopleCount >= 5) badges.push('water-protector');
		if (workerPeopleRate >= 0.8 && workerCapitalRate <= 0.5 && workerPeopleCount >= 5) badges.push('friend-of-worker');
		if (cleanPeopleRate >= 0.8 && cleanPeopleCount >= 5 && cleanCapitalOk) badges.push('renewables-champion');

		// Most Improved — needs a prior-session score to compare against.
		if (canaryScore != null && priorScores) {
			const prior = priorScores.get(member.id);
			if (prior != null && canaryScore - prior >= MOST_IMPROVED_DELTA) badges.push('most-improved');
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

	return results;
}

/**
 * Itemized audit trail for one member — "how we got this number."
 * Returns every scored vote with the points it contributed, plus totals.
 * Pure; the member page computes its own view, but the pipeline can use this
 * to spot-check a score.
 *
 * @returns {{ items: Array, totals: object }}
 */
export function explainMemberScore({ memberId, bills, votes: rawVotes, sponsorships = [], rollCalls = [] }) {
	const billMap = buildBillMap(bills);
	const billById = new Map(bills.map((b) => [b.id, b]));

	// Same final-vote dedupe as the scorer (procedural motions excluded), so the
	// audit trail matches the score.
	const proceduralIds = new Set(rollCalls.filter((rc) => isProceduralMotion(rc.description)).map((rc) => rc.id));
	const votes = dedupeVotes(rawVotes.filter((v) => v.member_id === memberId && !proceduralIds.has(v.roll_call_id)), rollCalls);
	const rcInfo = new Map();
	for (const rc of rollCalls) rcInfo.set(rc.id, { yea: rc.yea, nay: rc.nay });

	const items = [];
	let peopleYea = 0, peopleNay = 0, capitalYea = 0, capitalNay = 0, missed = 0;
	let votePointTotal = 0;

	for (const v of votes) {
		const bill = billMap.get(v.bill_id);
		if (!bill) continue;
		const rc = rcInfo.get(v.roll_call_id);
		const sw = bill.weight * (rc ? contestednessFactor(rc.yea, rc.nay) : 1);
		const points = votePoints({ forPeople: bill.forPeople, forCapital: bill.forCapital, weight: sw, voteValue: v.vote_value });
		votePointTotal += points;
		const src = billById.get(v.bill_id);
		items.push({
			bill_id: v.bill_id,
			bill_number: src?.bill_number,
			title: src?.title,
			alignment: bill.forPeople ? 'for_people' : 'for_capital',
			impact_tier: effectiveImpactTier(src),
			weight: Math.round(sw * 100) / 100,
			vote_value: v.vote_value,
			points: Math.round(points * 100) / 100
		});
		if (v.vote_value === 3 || v.vote_value === 4) missed++;
		else if (bill.forPeople) v.vote_value === 1 ? peopleYea++ : peopleNay++;
		else if (bill.forCapital) v.vote_value === 1 ? capitalYea++ : capitalNay++;
	}

	let sponsorPointTotal = 0;
	const sponsorItems = [];
	for (const s of sponsorships) {
		if (s.member_id !== memberId) continue;
		const bill = billMap.get(s.bill_id);
		if (!bill) continue;
		const base = (SPONSOR_WEIGHTS[s.sponsor_type] || 1) * bill.weight;
		const cheapVirtue = s.sponsor_type !== 1 && bill.forPeople && !bill.advanced;
		const w = cheapVirtue ? base * CHEAP_SPONSOR_WEIGHT : base;
		const points = bill.forPeople ? w : bill.forCapital ? -w : 0;
		if (points === 0) continue;
		sponsorPointTotal += points;
		const src = billById.get(s.bill_id);
		sponsorItems.push({
			bill_id: s.bill_id,
			bill_number: src?.bill_number,
			title: src?.title,
			sponsor_type: s.sponsor_type,
			alignment: bill.forPeople ? 'for_people' : 'for_capital',
			points: Math.round(points * 100) / 100
		});
	}

	return {
		items: items.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
		sponsorItems: sponsorItems.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
		totals: {
			scored_votes: items.length,
			people_yea: peopleYea,
			people_nay: peopleNay,
			capital_yea: capitalYea,
			capital_nay: capitalNay,
			missed,
			vote_points: Math.round(votePointTotal * 100) / 100,
			sponsor_points: Math.round(sponsorPointTotal * 100) / 100
		}
	};
}

// ─────────────────────────────────────────
// SUPABASE I/O HELPERS
// ─────────────────────────────────────────

function supabaseHeaders(key) {
	return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key };
}

/** Paginated fetch — Supabase caps responses at 1000 rows. */
export async function fetchAllRows({ supabaseUrl, supabaseKey }, path) {
	const rows = [];
	let offset = 0;
	const limit = 1000;
	while (true) {
		const sep = path.includes('?') ? '&' : '?';
		const res = await fetch(`${supabaseUrl}/rest/v1/${path}${sep}offset=${offset}&limit=${limit}`, {
			headers: supabaseHeaders(supabaseKey)
		});
		if (!res.ok) throw new Error(`DB fetch error: ${path} — ${await res.text()}`);
		const batch = await res.json();
		rows.push(...batch);
		if (batch.length < limit) break;
		offset += limit;
	}
	return rows;
}

/**
 * Fetch a member_id → canary_score map from a prior session's history,
 * preferring finalized snapshots. Used to compute the Most Improved badge.
 */
export async function fetchPriorScores(db, priorSessionId) {
	const map = new Map();
	if (!priorSessionId) return map;
	const rows = await fetchAllRows(db, `member_score_history?select=member_id,canary_score,snapshot_date,is_final&session_id=eq.${priorSessionId}&order=is_final.desc,snapshot_date.desc`);
	for (const r of rows) {
		// First row per member wins (finalized, else most recent).
		if (!map.has(r.member_id) && r.canary_score != null) map.set(r.member_id, r.canary_score);
	}
	return map;
}

/**
 * Write score results back to the members table (fast path: one RPC; falls
 * back to batched PATCHes if schema/006 isn't applied yet).
 */
export async function writeScores({ supabaseUrl, supabaseKey }, results) {
	const now = new Date().toISOString();
	const rows = results.map((r) => ({
		id: r.id,
		canary_score: r.canary_score,
		canary_tier: r.canary_tier,
		canary_badges: r.canary_badges,
		canary_votes_scored: r.canary_votes_scored,
		canary_score_updated_at: now
	}));

	const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/update_canary_scores`, {
		method: 'POST',
		headers: supabaseHeaders(supabaseKey),
		body: JSON.stringify({ scores: rows })
	});
	if (rpcRes.ok) return rows.length;

	console.warn(`update_canary_scores RPC unavailable (${rpcRes.status}) — falling back to per-member PATCH. Apply schema/006_canary_score_rpc.sql for single-request writes.`);
	for (let i = 0; i < rows.length; i += 10) {
		await Promise.all(
			rows.slice(i, i + 10).map(async (row) => {
				const { id, ...data } = row;
				const res = await fetch(`${supabaseUrl}/rest/v1/members?id=eq.${id}`, {
					method: 'PATCH',
					headers: { ...supabaseHeaders(supabaseKey), Prefer: 'return=minimal' },
					body: JSON.stringify(data)
				});
				if (!res.ok) throw new Error(`Patch members ${id} error: ${await res.text()}`);
			})
		);
	}
	return rows.length;
}

/**
 * Append a permanent history snapshot for this recalculation (schema/007).
 * Non-fatal: if the table/RPC isn't there yet, log and continue — the live
 * scores on the members table are still correct.
 */
export async function appendScoreHistory({ supabaseUrl, supabaseKey }, results, sessionId) {
	if (!sessionId) {
		console.warn('appendScoreHistory: no session id — skipping history snapshot');
		return 0;
	}
	const snapshots = results.map((r) => ({
		id: r.id,
		canary_score: r.canary_score,
		canary_tier: r.canary_tier,
		canary_badges: r.canary_badges,
		canary_votes_scored: r.canary_votes_scored
	}));
	const res = await fetch(`${supabaseUrl}/rest/v1/rpc/append_score_history`, {
		method: 'POST',
		headers: supabaseHeaders(supabaseKey),
		body: JSON.stringify({ snapshots, p_session_id: sessionId })
	});
	if (!res.ok) {
		console.warn(`append_score_history unavailable (${res.status}) — apply schema/007_score_history.sql to keep permanent history.`);
		return 0;
	}
	return snapshots.length;
}

/** Mark a session's latest snapshot per member as the permanent final record. */
export async function finalizeSession({ supabaseUrl, supabaseKey }, sessionId) {
	const res = await fetch(`${supabaseUrl}/rest/v1/rpc/finalize_session_scores`, {
		method: 'POST',
		headers: supabaseHeaders(supabaseKey),
		body: JSON.stringify({ p_session_id: sessionId })
	});
	if (!res.ok) throw new Error(`finalize_session_scores error: ${await res.text()}`);
	return res.json();
}
