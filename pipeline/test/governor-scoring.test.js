/**
 * CANARY BLAIR — governor scoring engine tests
 *
 * Action strings in fixtures mirror the real bill_actions rows verified live
 * ("Approved by Governor 4/1/2026 - Senate Journal" etc.).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGovernor, governorActionForBill } from '../lib/governor-scoring.js';

function bill(id, alignment, tier = 4, extra = {}) {
	return { id, bill_number: `HB${id}`, title: `Bill ${id}`, ai_alignment: alignment, ai_impact_tier: tier, ai_tags: ['x'], ...extra };
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

test('impact tier and confidence weighting flow through from the shared engine', () => {
	// Landmark for_capital signing (w=5) vs routine for_people signing (w=1):
	// raw = 1 - 5 = -4, max = 6 -> round((2/12)*100) = 17
	const bills = [bill(1, 'for_people', 4), bill(2, 'for_capital', 1)];
	const actionsByBill = new Map([
		[1, ['Approved by Governor 3/25/2026']],
		[2, ['Approved by Governor 3/25/2026']]
	]);
	assert.equal(scoreGovernor({ bills, actionsByBill }).score, 17);

	// Same but the landmark call is low-confidence (x0.5 -> w=2.5):
	// raw = 1 - 2.5 = -1.5, max = 3.5 -> round((2/7)*100) = 29
	const bills2 = [bill(1, 'for_people', 4), bill(2, 'for_capital', 1, { ai_confidence: 'low' })];
	assert.equal(scoreGovernor({ bills: bills2, actionsByBill }).score, 29);
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
	assert.equal(items[0].bill_number, 'HB1'); // |+5| > |-1|
	assert.equal(items[0].points, 5);
	assert.equal(items[1].points, -1);
});

test('no scoreable actions yields null score, not 0', () => {
	const { score, tier } = scoreGovernor({ bills: [], actionsByBill: new Map() });
	assert.equal(score, null);
	assert.equal(tier, null);
});
