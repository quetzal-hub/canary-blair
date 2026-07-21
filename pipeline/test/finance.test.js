/**
 * Tests for the finance total extractor. The FollowTheMoney response shape
 * isn't publicly documented, so these verify the defensive walker's behavior
 * against the nested {"Field": "value"} pattern FTM is known to use — not the
 * real field names (those get confirmed via the script's dry run).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTotalRaised, extractGroupedRows } from '../finance.js';

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

// ── grouped rows (fixtures mirror the API docs' JSON record shapes) ──

const donorRecord = (name, typeName, total, count) => ({
	request: 'c-t-eid=123&gro=d-eid',
	Contributor: { token: 'd-eid', id: '943', Contributor: name },
	Type_of_Contributor: { token: 'd-et', id: '3', Type_of_Contributor: typeName },
	'#_of_Records': { '#_of_Records': String(count) },
	'Total_$': { 'Total_$': total }
});

test('extractGroupedRows parses donor rows with type, total, and record count', () => {
	const json = {
		records: [
			donorRecord('WHITE, DEAN V', 'Individual', '435000.00', 5),
			donorRecord('EXPRESS SCRIPTS', 'Non-Individual', '5000.00', 2)
		]
	};
	const rows = extractGroupedRows(json, { name: 'Contributor', type: 'Type_of_Contributor' });
	assert.equal(rows.length, 2);
	assert.deepEqual(rows[0], { name: 'WHITE, DEAN V', type: 'Individual', total: 435000, records: 5 });
	assert.deepEqual(rows[1], { name: 'EXPRESS SCRIPTS', type: 'Non-Individual', total: 5000, records: 2 });
});

test('extractGroupedRows parses industry rows (industry + parent sector)', () => {
	const json = {
		records: [
			{
				Industry: { token: 'd-cci', id: '113', Industry: 'Lodging & Tourism' },
				Sector: { token: 'd-ccg', id: '7', Sector: 'General Business' },
				'#_of_Records': { '#_of_Records': '12' },
				'Total_$': { 'Total_$': '86500.00' }
			}
		]
	};
	const rows = extractGroupedRows(json, { industry: 'Industry', sector: 'Sector' });
	assert.deepEqual(rows, [
		{ industry: 'Lodging & Tourism', sector: 'General Business', total: 86500, records: 12 }
	]);
});

test('extractGroupedRows skips records missing every requested field', () => {
	const json = { records: [{ 'Total_$': { 'Total_$': '100.00' } }] };
	assert.deepEqual(extractGroupedRows(json, { name: 'Contributor' }), []);
});

test('extractGroupedRows returns [] on malformed responses', () => {
	assert.deepEqual(extractGroupedRows(null, { name: 'Contributor' }), []);
	assert.deepEqual(extractGroupedRows({}, { name: 'Contributor' }), []);
	assert.deepEqual(extractGroupedRows({ records: 'nope' }, { name: 'Contributor' }), []);
});
