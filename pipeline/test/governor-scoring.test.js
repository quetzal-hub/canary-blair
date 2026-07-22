/**
 * CANARY BLAIR — governor scoring engine tests
 *
 * Action strings in fixtures mirror the real bill_actions rows verified live
 * ("Approved by Governor 4/1/2026 - Senate Journal" etc.).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGovernor, governorActionForBill, EO_ACTION_WEIGHT, EXEC_REQUEST_SIGN_MULTIPLIER } from '../lib/governor-scoring.js';

function bill(id, alignment, tier = 4, extra = {}) {
	return { id, bill_number: `HB${id}`, title: `Bill ${id}`, ai_alignment: alignment, ai_impact_tier: tier, ai_tags: ['x'], ...extra };
}
function eo(number, alignment, tier = 4, extra = {}) {
	return { eo_number: number, title: `EO ${number}`, ai_alignment: alignment, ai_impact_tier: tier, ai_tags: ['x'], ...extra };
}

test('governorActionForBill classifies the real action string variants', () => {
	assert.equal(governorActionForBill(['Approved by Governor 4/1/2026 - Senate Journal']), 'signed');
	assert.equal(governorActionForBill(['To Governor 3/18/2026', 'Vetoed by Governor 4/1/2026']), 'vetoed');
	assert.equal(governorActionForBill(["Became law without Governor's signature - Senate Journal"]), 'no_signature');
	assert.equal(governorActionForBill(['To Governor 3/18/2026']), null);
	// Veto takes precedence if both ever appear
	assert.equal(governorActionForBill(['Approved by Governor 4/1/2026', 'Vetoed by Governor 4/1/2026']), 'vetoed');
});

test('signing people bills and vetoing capital bills scores 100', () => {
	const bills = [bill(1, 'for_people'), bill(2, 'for_capital')];
	const actionsByBill = new Map([
		[1, ['Approved by Governor 3/25/2026']],
		[2, ['Vetoed by Governor 4/1/2026']]
	]);
	const { score, tier, totals } = scoreGovernor({ bills, actionsByBill });
	assert.equal(score, 100);
	assert.equal(tier, 1);
	assert.equal(totals.signed_people, 1);
	assert.equal(totals.vetoed_capital, 1);
});

test('vetoing people bills and signing capital bills scores 0', () => {
	const bills = [bill(1, 'for_people'), bill(2, 'for_capital')];
	const actionsByBill = new Map([
		[1, ['Vetoed by Governor 4/1/2026']],
		[2, ['Approved by Governor 3/25/2026']]
	]);
	const { score, tier } = scoreGovernor({ bills, actionsByBill });
	assert.equal(score, 0);
	assert.equal(tier, 6);
});

test('became-law-without-signature earns half points against full max', () => {
	// One for_people bill, weight 1, allowed to become law unsigned:
	// raw = +0.5, max = 1 -> score = round((0.5+1)/2 * 100) = 75
	const bills = [bill(1, 'for_people')];
	const actionsByBill = new Map([[1, ["Became law without Governor's signature"]]]);
	const { score, totals } = scoreGovernor({ bills, actionsByBill });
	assert.equal(score, 75);
	assert.equal(totals.no_signature_people, 1);
});

test('neutral and unclassified bills are counted but never scored', () => {
	const bills = [bill(1, 'for_people'), bill(2, 'neutral'), bill(3, null)];
	const actionsByBill = new Map([
		[1, ['Approved by Governor 3/25/2026']],
		[2, ['Approved by Governor 3/25/2026']],
		[3, ['Vetoed by Governor 4/1/2026']]
	]);
	const { score, totals } = scoreGovernor({ bills, actionsByBill });
	assert.equal(score, 100); // only the for_people signing moves the number
	assert.equal(totals.actions_total, 3);
	assert.equal(totals.actions_scored, 1);
});

test('true totals count every action regardless of alignment; scored subset only aligned ones', () => {
	// 2 signed (one for_people, one neutral), 1 vetoed (unclassified):
	// signed_total = 2 even though only 1 signing is scored.
	const bills = [bill(1, 'for_people'), bill(2, 'neutral'), bill(3, null)];
	const actionsByBill = new Map([
		[1, ['Approved by Governor 3/25/2026']],
		[2, ['Approved by Governor 3/25/2026']],
		[3, ['Vetoed by Governor 4/1/2026']]
	]);
	const { totals } = scoreGovernor({ bills, actionsByBill });
	assert.equal(totals.signed_total, 2);
	assert.equal(totals.vetoed_total, 1);
	assert.equal(totals.no_signature_total, 0);
	assert.equal(totals.signed_people + totals.signed_capital, 1); // only the aligned signing scored
});

test('impact tier and confidence weighting flow through from the shared engine', () => {
	// Landmark for_capital signing (w=12) vs routine for_people signing (w=1):
	// raw = 1 - 12 = -11, max = 13 -> round((2/26)*100) = 8
	const bills = [bill(1, 'for_people', 4), bill(2, 'for_capital', 1)];
	const actionsByBill = new Map([
		[1, ['Approved by Governor 3/25/2026']],
		[2, ['Approved by Governor 3/25/2026']]
	]);
	assert.equal(scoreGovernor({ bills, actionsByBill }).score, 8);

	// Same but the landmark call is low-confidence (x0.5 -> w=6):
	// raw = 1 - 6 = -5, max = 7 -> round((2/14)*100) = 14
	const bills2 = [bill(1, 'for_people', 4), bill(2, 'for_capital', 1, { ai_confidence: 'low' })];
	assert.equal(scoreGovernor({ bills: bills2, actionsByBill }).score, 14);
});

test('a human alignment override flips how an action is scored', () => {
	const bills = [bill(1, 'for_capital', 4, { ai_alignment_override: 'for_people' })];
	const actionsByBill = new Map([[1, ['Approved by Governor 3/25/2026']]]);
	assert.equal(scoreGovernor({ bills, actionsByBill }).score, 100);
});

test('items are itemized with signed points and sorted by magnitude', () => {
	const bills = [bill(1, 'for_people', 1), bill(2, 'for_capital', 4)];
	const actionsByBill = new Map([
		[1, ['Approved by Governor 3/25/2026']],
		[2, ['Approved by Governor 3/25/2026']]
	]);
	const { items } = scoreGovernor({ bills, actionsByBill });
	assert.equal(items.length, 2);
	assert.equal(items[0].bill_number, 'HB1'); // |+12| > |-1|
	assert.equal(items[0].points, 12);
	assert.equal(items[1].points, -1);
});

test('executive orders score as the governor\'s own initiative (EO_ACTION_WEIGHT)', () => {
	// One routine for_capital EO (tier4, w1) × EO_ACTION_WEIGHT, no bill actions.
	// raw = -1*EO_WEIGHT, max = 1*EO_WEIGHT -> score = round((0)/(2)*100) = 0
	const executiveOrders = [eo('3-25', 'for_capital', 4)];
	const { score, totals } = scoreGovernor({ bills: [], actionsByBill: new Map(), executiveOrders });
	assert.equal(score, 0);
	assert.equal(totals.eo_total, 1);
	assert.equal(totals.eo_capital, 1);

	// A for_people EO alone → 100.
	assert.equal(scoreGovernor({ bills: [], actionsByBill: new Map(), executiveOrders: [eo('1-25', 'for_people', 4)] }).score, 100);
});

test('an executive order outweighs a bill signing of the same tier (own initiative)', () => {
	// Sign a routine for_people bill (+1) but issue a routine for_capital EO
	// (-1 × EO_ACTION_WEIGHT=3 = -3): raw = 1 - 3 = -2, max = 1 + 3 = 4
	// score = round((-2+4)/8*100) = round(25) = 25 — the EO dominates.
	const bills = [bill(1, 'for_people', 4)];
	const actionsByBill = new Map([[1, ['Approved by Governor 3/25/2026']]]);
	const executiveOrders = [eo('3-25', 'for_capital', 4)];
	const { score } = scoreGovernor({ bills, actionsByBill, executiveOrders });
	assert.equal(score, 25);
	assert.equal(EO_ACTION_WEIGHT, 3);
});

test('signing a bill he himself requested carries extra weight', () => {
	// Sign one routine for_capital bill (w1). As a normal signing: -1.
	// As his own request: -1 × 1.5 = -1.5. Contrast the two scores.
	const bills = [bill(1, 'for_capital', 4)];
	const actionsByBill = new Map([[1, ['Approved by Governor 3/25/2026']]]);
	const normal = scoreGovernor({ bills, actionsByBill });
	const ownRequest = scoreGovernor({ bills, actionsByBill, execRequestBillIds: new Set([1]) });
	// Both are 0 (only a negative signing → raw=-w, max=w → score 0), so instead
	// verify the multiplier flows into the totals and the weighted points.
	assert.equal(ownRequest.totals.exec_request_signed, 1);
	assert.equal(normal.totals.exec_request_signed, 0);
	// The exec-request item's points are 1.5× the normal item's.
	assert.equal(ownRequest.items[0].points, -1.5);
	assert.equal(normal.items[0].points, -1);
	assert.equal(EXEC_REQUEST_SIGN_MULTIPLIER, 1.5);
});

test('a neutral executive order does not move the score', () => {
	const bills = [bill(1, 'for_people', 4)];
	const actionsByBill = new Map([[1, ['Approved by Governor 3/25/2026']]]);
	const { score, totals } = scoreGovernor({ bills, actionsByBill, executiveOrders: [eo('9-25', 'neutral', 3)] });
	assert.equal(score, 100); // only the for_people signing counts
	assert.equal(totals.eo_total, 1);
	assert.equal(totals.eo_scored, 0);
});

test('no scoreable actions yields null score, not 0', () => {
	const { score, tier } = scoreGovernor({ bills: [], actionsByBill: new Map() });
	assert.equal(score, null);
	assert.equal(tier, null);
});
