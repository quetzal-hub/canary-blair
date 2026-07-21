/**
 * Tests for the finance total extractor. The FollowTheMoney response shape
 * isn't publicly documented, so these verify the defensive walker's behavior
 * against the nested {"Field": "value"} pattern FTM is known to use — not the
 * real field names (those get confirmed via the script's dry run).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTotalRaised } from '../finance.js';

test('extractTotalRaised reads the documented records[].Total_$.Total_$ shape', () => {
	const resp = {
		metaInfo: { format: 'json' },
		records: [{ Candidate: { Candidate: 'Jane Doe' }, 'Total_$': { 'Total_$': '125,400.00' } }]
	};
	assert.equal(extractTotalRaised(resp), 125400);
});

test('extractTotalRaised sums Total_$ across multiple records', () => {
	const resp = {
		records: [
			{ 'Total_$': { 'Total_$': '1000.00' } },
			{ 'Total_$': { 'Total_$': '2500.50' } }
		]
	};
	assert.equal(extractTotalRaised(resp), 3500.5);
});

test('extractTotalRaised picks the largest matching total', () => {
	const resp = {
		total_amount: '1000',
		nested: { total_contributions: '9,500' }
	};
	assert.equal(extractTotalRaised(resp), 9500);
});

test('extractTotalRaised returns null when there is no total field', () => {
	assert.equal(extractTotalRaised({ records: [{ name: 'x', district: '3' }] }), null);
	assert.equal(extractTotalRaised(null), null);
});
