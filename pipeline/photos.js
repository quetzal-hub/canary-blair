/**
 * CANARY BLAIR — Legislator photo sync (official WV Legislature roster)
 *
 * Populates members.photo_url from the WV Legislature's own public member
 * roster pages — official photos of public officials, hosted by the state
 * itself. LegiScan's data has no photo field, so this scrapes the two roster
 * pages directly rather than guessing a filename pattern (their own photo
 * filenames aren't consistent: legal-vs-nickname first names, e.g.
 * "Parsons_Frederick.jpg" for a delegate who goes by and is listed as "Joe").
 *
 * MATCHING: by name, not district. WV Senate districts elect TWO senators
 * each (17 districts, 34 seats), so district+chamber is NOT a unique key for
 * the Senate — an earlier version of this script learned that the hard way
 * (it silently paired senators from the same district with each other's
 * photos). Matching instead requires the roster row's displayed name to
 * contain BOTH the member's last name AND their first name or nickname —
 * which also naturally (and safely) SKIPS stale data: a few House districts
 * in our synced data show a prior occupant no longer on the live roster
 * (resigned/replaced) or a seat that's now vacant. Those get reported, not
 * guessed at.
 *
 * Every matched URL is also verified live (HEAD request, image content-type)
 * before being trusted.
 *
 * Dry-run by default: prints what would change and writes nothing until you
 * pass --commit, consistent with finance.js and finance-eid-import.js.
 *
 * Usage:
 *   node pipeline/photos.js            # dry run: show what would change
 *   node pipeline/photos.js --commit   # write photo_url to the database
 */
import 'dotenv/config';
import { normTokens, isNameMatch } from './lib/name-match.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const COMMIT = process.argv.includes('--commit');

const ROSTERS = [
	{ chamber: 'H', url: 'https://www.wvlegislature.gov/House/roster.cfm' },
	{ chamber: 'S', url: 'https://www.wvlegislature.gov/Senate1/roster.cfm' }
];

function dbHeaders(extra = {}) {
	return { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY, ...extra };
}

async function fetchMembers() {
	const res = await fetch(
		`${SUPABASE_URL}/rest/v1/members?select=id,full_name,first_name,middle_name,last_name,nickname,chamber,district,photo_url&is_current=eq.true`,
		{ headers: dbHeaders() }
	);
	if (!res.ok) throw new Error(`DB fetch error: ${await res.text()}`);
	return res.json();
}

async function patchPhoto(memberId, photoUrl) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${memberId}`, {
		method: 'PATCH',
		headers: dbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
		body: JSON.stringify({ photo_url: photoUrl })
	});
	if (!res.ok) throw new Error(`Patch member ${memberId}: ${await res.text()}`);
}

/**
 * Parses one roster page's raw HTML into { name, districtNum, imgUrl } rows.
 * Both chambers use the same row shape: an <a> wrapping <img src="...jpg">,
 * a second <a> with the display name, then <td class="tdborder"> cells for
 * party and district. District is captured for logging only — it is NOT a
 * safe matching key on its own (see module comment re: Senate).
 */
function parseRoster(html, pageUrl) {
	const rows = html.split('<tr valign="top">').slice(1); // [0] is header/nav before the table
	const parsed = [];
	for (const row of rows) {
		const imgMatch = row.match(/<img src="([^"]+\.jpg)"/i);
		if (!imgMatch) continue;
		const nameMatch = row.match(/<\/span><\/a><a[^>]*>([^<]+)<\/a>/);
		if (!nameMatch) continue;

		const cells = [...row.matchAll(/<td class="tdborder">([\s\S]*?)<\/td>/g)].map((m) => m[1]);
		const districtMatch = cells[2] ? cells[2].match(/(\d+)/) : null;

		parsed.push({
			name: nameMatch[1].trim(),
			districtNum: districtMatch ? parseInt(districtMatch[1], 10) : null,
			imgUrl: new URL(imgMatch[1], pageUrl).href
		});
	}
	return parsed;
}

/**
 * Finds roster rows (within the member's own chamber) whose displayed name
 * contains every token of the member's last name AND at least one token of
 * their first name or nickname. Returns all matches — the caller decides
 * what to do with zero or multiple.
 */
function findCandidates(member, rosterRows) {
	const firstNameFields = [member.first_name, member.middle_name, member.nickname];
	return rosterRows.filter((row) => isNameMatch(member.last_name, firstNameFields, normTokens(row.name)));
}

/** Confirms a photo URL is real before we ever store or show it. */
async function verifyImage(url) {
	try {
		const res = await fetch(url, { method: 'HEAD' });
		return res.ok && (res.headers.get('content-type') || '').startsWith('image/');
	} catch {
		return false;
	}
}

async function run() {
	console.log(`🖼️  Legislator photo sync — ${COMMIT ? 'COMMIT (writing to DB)' : 'DRY RUN (no writes)'}\n`);

	const rowsByChamber = { H: [], S: [] };
	for (const { chamber, url } of ROSTERS) {
		console.log(`Fetching ${chamber === 'H' ? 'House' : 'Senate'} roster...`);
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Roster fetch failed (${chamber}): HTTP ${res.status}`);
		const html = await res.text();
		rowsByChamber[chamber] = parseRoster(html, url);
		console.log(`  Parsed ${rowsByChamber[chamber].length} rows`);
	}

	const members = await fetchMembers();
	console.log(`\n${members.length} sitting members to match\n`);

	let updated = 0,
		unchanged = 0,
		noMatch = 0,
		ambiguous = 0,
		failedVerify = 0;

	for (const m of members) {
		const candidates = findCandidates(m, rowsByChamber[m.chamber] || []);

		if (candidates.length === 0) {
			console.warn(`   ⚠ ${m.full_name} (${m.chamber} ${m.district}): no roster match — possibly a vacant/reassigned seat or a name too different to detect. Skipped.`);
			noMatch++;
			continue;
		}
		if (candidates.length > 1) {
			console.warn(`   ⚠ ${m.full_name}: ambiguous — matched ${candidates.length} roster rows (${candidates.map((c) => c.name).join(', ')}). Skipped.`);
			ambiguous++;
			continue;
		}

		const match = candidates[0];
		if (match.districtNum != null && m.district && !String(m.district).includes(String(match.districtNum).padStart(3, '0'))) {
			console.log(`   ℹ ${m.full_name}: matched by name, but roster district (${match.districtNum}) differs from stored district (${m.district}) — redistricting or a data update may be due.`);
		}

		if (m.photo_url === match.imgUrl) {
			unchanged++;
			continue;
		}

		const ok = await verifyImage(match.imgUrl);
		if (!ok) {
			console.warn(`   ⚠ ${m.full_name}: matched URL didn't verify as a live image — skipped\n     ${match.imgUrl}`);
			failedVerify++;
			continue;
		}

		updated++;
		if (!COMMIT) {
			console.log(`   would set ${m.full_name}: ${match.imgUrl}`);
		} else {
			await patchPhoto(m.id, match.imgUrl);
			console.log(`   ✅ ${m.full_name}`);
		}
	}

	console.log(`\n${updated} to update, ${unchanged} unchanged, ${noMatch} no match, ${ambiguous} ambiguous, ${failedVerify} failed verification.`);
	if (!COMMIT && updated > 0) console.log(`\nRun again with --commit to write these ${updated} photo URLs.`);
}

run().catch((err) => {
	console.error('\n❌ Photo sync failed:', err.message);
	process.exit(1);
});
