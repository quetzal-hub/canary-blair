/**
 * CANARY BLAIR — Governor scoring engine (pure)
 *
 * Scores the governor's actions on bills using the SAME AI classifications
 * (effective post-override alignment, confidence-discounted impact weights)
 * that the legislator scores use — one methodology, different action set.
 *
 * Actions and points (weight w = getBillWeight, same as member scoring):
 *   - signed a for_people bill:        +w      (endorsed a good bill)
 *   - vetoed a for_people bill:        -w      (blocked a good bill)
 *   - signed a for_capital bill:       -w
 *   - vetoed a for_capital bill:       +w
 *   - became law WITHOUT signature:    half points, same sign as signing —
 *     in WV a governor can let a bill become law by ignoring it. That's
 *     acquiescence, not endorsement: half credit on a good bill, half blame
 *     on a bad one. Max possible still counts the FULL weight (they could
 *     have signed/vetoed) — passivity is itself the choice being scored.
 *
 * Neutral/unclassified bills contribute nothing, exactly like member scoring.
 * Normalization identical to scoreMembers: (raw + max) / (2 * max) * 100.
 *
 * Pure function — no I/O — so it's unit-testable and can't drift between the
 * CLI runner and anything else that ever computes it.
 */
import { buildBillMap, getTier } from './scoring.js';

/** Classify one bill's governor action from its (deduped) action texts. */
export function governorActionForBill(actionTexts) {
	let hasVeto = false;
	let hasApprove = false;
	let hasNoSignature = false;
	for (const t of actionTexts) {
		if (/vetoed by governor/i.test(t)) hasVeto = true;
		else if (/approved by governor/i.test(t)) hasApprove = true;
		else if (/became law without governor'?s signature/i.test(t)) hasNoSignature = true;
	}
	// Veto wins if both somehow appear (shouldn't in practice; no overrides
	// this session). Signature-less enactment only counts when not signed.
	if (hasVeto) return 'vetoed';
	if (hasApprove) return 'signed';
	if (hasNoSignature) return 'no_signature';
	return null;
}

/**
 * @param {object} input
 * @param {Array}  input.bills          rows with id, bill_number, title, ai_tags,
 *                                      ai_alignment[_override], ai_impact_tier[_override], ai_confidence
 * @param {Map}    input.actionsByBill  bill_id → array of action_text strings
 * @returns {{ score, tier, items, totals }}
 */
export function scoreGovernor({ bills, actionsByBill }) {
	const billMap = buildBillMap(bills); // effective-alignment + confidence-weighted, neutral excluded
	const billById = new Map(bills.map((b) => [b.id, b]));

	let raw = 0;
	let max = 0;
	const items = [];
	const totals = {
		// True totals per action type, INCLUDING neutral/unclassified bills —
		// these are what actually happened, for honest display.
		signed_total: 0, vetoed_total: 0, no_signature_total: 0,
		// Scored subset (aligned bills only) — these are what moved the number.
		signed_people: 0, signed_capital: 0,
		vetoed_people: 0, vetoed_capital: 0,
		no_signature_people: 0, no_signature_capital: 0,
		actions_total: 0, actions_scored: 0
	};

	for (const [billId, actionTexts] of actionsByBill) {
		const action = governorActionForBill(actionTexts);
		if (!action) continue;
		totals.actions_total++;
		totals[`${action === 'no_signature' ? 'no_signature' : action}_total`]++;

		const bill = billMap.get(billId);
		if (!bill) continue; // neutral or unclassified — doesn't move the score
		totals.actions_scored++;

		const w = bill.weight;
		const sign = bill.forPeople ? 1 : -1; // direction "signing" moves the score
		let points;
		if (action === 'signed') points = sign * w;
		else if (action === 'vetoed') points = -sign * w;
		else points = sign * w * 0.5; // no_signature: acquiescence at half strength
		raw += points;
		max += w;

		const src = billById.get(billId);
		items.push({
			bill_id: billId,
			bill_number: src?.bill_number,
			title: src?.title,
			action,
			alignment: bill.forPeople ? 'for_people' : 'for_capital',
			impact_tier: src?.ai_impact_tier_override ?? src?.ai_impact_tier ?? null,
			points: Math.round(points * 100) / 100
		});

		const key = `${action === 'signed' ? 'signed' : action === 'vetoed' ? 'vetoed' : 'no_signature'}_${bill.forPeople ? 'people' : 'capital'}`;
		totals[key]++;
	}

	let score = null;
	let tier = null;
	if (max > 0) {
		score = Math.min(100, Math.max(0, Math.round(((raw + max) / (2 * max)) * 100)));
		tier = getTier(score).tier;
	}

	items.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
	totals.raw = Math.round(raw * 100) / 100;
	totals.max = Math.round(max * 100) / 100;

	return { score, tier, items, totals };
}
