/**
 * CANARY BLAIR — LegiScan contact-field extraction tests
 *
 * Fixture shape mirrors a real getSessionPeople response (verified live
 * against api.legiscan.com while investigating roster freshness).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPhone, extractEmail, formatCapitolAddress } from '../lib/legiscan-contact.js';

function person(bio) {
	return { people_id: 1, name: 'Test Person', bio };
}

test('extractPhone prefers capitol_phone over district_phone', () => {
	const p = person({ social: { capitol_phone: '304-357-7970', district_phone: '304-916-2177' } });
	assert.equal(extractPhone(p), '304-357-7970');
});

test('extractPhone falls back to district_phone when capitol_phone is empty', () => {
	const p = person({ social: { capitol_phone: '', district_phone: '304-916-2177' } });
	assert.equal(extractPhone(p), '304-916-2177');
});

test('extractPhone returns null when neither is present', () => {
	assert.equal(extractPhone(person({ social: {} })), null);
	assert.equal(extractPhone(person(undefined)), null);
	assert.equal(extractPhone({}), null);
});

test('extractEmail reads bio.social.email', () => {
	assert.equal(extractEmail(person({ social: { email: 'mike.azinger@wvsenate.gov' } })), 'mike.azinger@wvsenate.gov');
	assert.equal(extractEmail(person({ social: { email: '' } })), null);
});

test('formatCapitolAddress formats a full real-shaped address', () => {
	const p = person({
		capitol_address: { address1: 'Room 441M, Bldg. 1', address2: '', city: 'Charleston', state: 'WV', zip: '25305' }
	});
	assert.equal(formatCapitolAddress(p), 'Room 441M, Bldg. 1, Charleston, WV 25305');
});

test('formatCapitolAddress includes address2 when present', () => {
	const p = person({
		capitol_address: { address1: '1900 Kanawha Blvd. E.', address2: 'Room 228M, Bldg. 1', city: 'Charleston', state: 'WV', zip: '25305' }
	});
	assert.equal(formatCapitolAddress(p), '1900 Kanawha Blvd. E., Room 228M, Bldg. 1, Charleston, WV 25305');
});

test('formatCapitolAddress returns null when address1 is missing', () => {
	assert.equal(formatCapitolAddress(person({ capitol_address: {} })), null);
	assert.equal(formatCapitolAddress(person(undefined)), null);
});
