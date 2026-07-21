/**
 * CANARY BLAIR — photo/leadership roster parser tests
 *
 * Fixtures mirror the real markup on wvlegislature.gov's roster pages
 * (verified live before writing photos.js), including the two edge cases
 * that would otherwise break a naive parser: a title with no trailing colon
 * ("President of the Senate") and a title shared by multiple people
 * ("Assistant Majority Leaders").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster, parseLeadership } from '../photos.js';

const PAGE_URL = 'https://www.wvlegislature.gov/House/roster.cfm';

test('parseRoster extracts name, district, and resolved image URL per row', () => {
	const html = `
		<tr valign="top">
		<td class="tdborder"><a style="border-bottom:none;" href="lawmaker.cfm?member=Speaker Hanshaw"><span><img src="../../images/members/2025/house/Hanshaw_Roger.jpg" width="45px"></span></a><a href="lawmaker.cfm?member=Speaker Hanshaw" style="vertical-align:top">Roger Hanshaw</a></td>
		<td class="tdborder">Republican</td>
		<td class="tdborder">062</td>
		</tr>
	`;
	const rows = parseRoster(html, PAGE_URL);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].name, 'Roger Hanshaw');
	assert.equal(rows[0].districtNum, 62);
	assert.equal(rows[0].imgUrl, 'https://www.wvlegislature.gov/images/members/2025/house/Hanshaw_Roger.jpg');
});

test('parseLeadership handles a title with no trailing colon', () => {
	const html = `
		<h2>Senate Leadership</h2>
		<strong>President of the Senate</strong>
		<a href="lawmaker.cfm?member=President Smith">Randy E. Smith</a><br>
		<strong>President Pro Tempore:</strong>
		<a href="lawmaker.cfm?member=Senator Taylor">Jay Taylor</a><br>
		<table></table>
	`;
	const entries = parseLeadership(html, 'Senate Leadership');
	assert.deepEqual(entries, [
		{ title: 'President of the Senate', names: ['Randy E. Smith'] },
		{ title: 'President Pro Tempore', names: ['Jay Taylor'] }
	]);
});

test('parseLeadership attributes every name under a shared title to that title', () => {
	const html = `
		<h2>House Leadership</h2>
		<strong>Assistant Majority Leaders:</strong>
		<a href="lawmaker.cfm?member=Delegate Pritt">David Elliott Pritt</a>, <a href="lawmaker.cfm?member=Delegate Green">David Green</a>, <a href="lawmaker.cfm?member=Delegate Moore">Erica Moore</a><br>
		<table></table>
	`;
	const entries = parseLeadership(html, 'House Leadership');
	assert.equal(entries.length, 1);
	assert.equal(entries[0].title, 'Assistant Majority Leaders');
	assert.deepEqual(entries[0].names, ['David Elliott Pritt', 'David Green', 'Erica Moore']);
});

test('parseLeadership stops at the roster table and does not pull in roster rows', () => {
	const html = `
		<h2>House Leadership</h2>
		<strong>Speaker of the House:</strong>
		<a href="lawmaker.cfm?member=Speaker Hanshaw">Roger Hanshaw</a><br>
		<table class="tabborder">
		<tr valign="top">
		<td class="tdborder"><a href="lawmaker.cfm?member=Delegate Adkins">Stanley Adkins</a></td>
		</tr>
		</table>
	`;
	const entries = parseLeadership(html, 'House Leadership');
	assert.equal(entries.length, 1);
	assert.deepEqual(entries[0].names, ['Roger Hanshaw']);
});

test('parseLeadership returns [] when the heading is not found', () => {
	assert.deepEqual(parseLeadership('<html></html>', 'House Leadership'), []);
});
