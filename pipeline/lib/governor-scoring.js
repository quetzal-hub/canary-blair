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
import { buildBillMap, getTier, getBillWeight, effectiveAlignment, effectiveImpactTier } from './scoring.js';

// An executive order is the Governor's UNILATERAL act — no legislature to share
// credit or blame — so it counts as his own initiative, weighted like a primary
// sponsorship (3×) rather than a reactive signing.
export const EO_ACTION_WEIGHT = 3;

// Signing a bill he himself requested ("[By Request of the Executive]") is the
// strongest ownership — he both proposed it and enacted it — so it counts extra.
export const EXEC_REQUEST_SIGN_MULTIPLIER = 1.5;

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
 * @param {Array}  input.bills               rows with id, bill_number, title, ai_tags,
 *                                           ai_alignment[_override], ai_impact_tier[_override], ai_confidence
 * @param {Map}    input.actionsByBill       bill_id → array of action_text strings
 * @param {Array}  [input.executiveOrders]   rows with eo_number, title, ai_alignment[_override], ai_impact_tier[_override], ai_confidence
 * @param {Set}    [input.execRequestBillIds] bill_ids the Governor requested ("[By Request of the Executive]")
 * @returns {{ score, tier, items, totals }}
 */
export function scoreGovernor({ bills, actionsByBill, executiveOrders = [], execRequestBillIds = new Set() }) {
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
		actions_total: 0, actions_scored: 0,
		// Executive orders (his unilateral acts) and executive-request signings.
		eo_total: executiveOrders.length, eo_scored: 0, eo_people: 0, eo_capital: 0,
		exec_request_signed: 0
	};

	for (const [billId, actionTexts] of actionsByBill) {
		const action = governorActionForBill(actionTexts);
		if (!action) continue;
		totals.actions_total++;
		totals[`${action === 'no_signature' ? 'no_signature' : action}_total`]++;

		const bill = billMap.get(billId);
		if (!bill) continue; // neutral or unclassified — doesn't move the score
		totals.actions_scored++;

		// Signing a bill he himself requested carries extra ownership weight.
		const isExecRequest = action === 'signed' && execRequestBillIds.has(billId);
		const w = bill.weight * (isExecRequest ? EXEC_REQUEST_SIGN_MULTIPLIER : 1);
		if (isExecRequest) totals.exec_request_signed++;
		const sign = bill.forPeople ? 1 : -1; // direction "signing" moves the score
		let points;
		if (action === 'signed') points = sign * w;
		else if (action === 'vetoed') points = -sign * w;
		else points = sign * w * 0.5; // no_signature: acquiescence at half strength
		raw += points;
		max += w;

		const src = billById.get(billId);
		items.push({
			type: 'bill',
			bill_id: billId,
			bill_number: src?.bill_number,
			title: src?.title,
			action,
			executive_request: isExecRequest,
			alignment: bill.forPeople ? 'for_people' : 'for_capital',
			impact_tier: src?.ai_impact_tier_override ?? src?.ai_impact_tier ?? null,
			points: Math.round(points * 100) / 100
		});

		const key = `${action === 'signed' ? 'signed' : action === 'vetoed' ? 'vetoed' : 'no_signature'}_${bill.forPeople ? 'people' : 'capital'}`;
		totals[key]++;
	}

	// Executive orders — the Governor's unilateral acts. Issuing a for_people EO
	// helps his score, a for_capital EO hurts it, each weighted as his own
	// initiative (EO_ACTION_WEIGHT). Neutral EOs don't move the number.
	for (const eo of executiveOrders) {
		const alignment = effectiveAlignment(eo);
		if (!alignment || alignment === 'neutral') continue;
		const forPeople = alignment === 'for_people';
		const w = getBillWeight(eo) * EO_ACTION_WEIGHT;
		const points = (forPeople ? 1 : -1) * w;
		raw += points;
		max += w;
		totals.eo_scored++;
		totals[forPeople ? 'eo_people' : 'eo_capital']++;
		items.push({
			type: 'executive_order',
			eo_number: eo.eo_number,
			title: eo.title,
			action: 'executive_order',
			alignment,
			impact_tier: effectiveImpactTier(eo),
			points: Math.round(points * 100) / 100
		});
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
