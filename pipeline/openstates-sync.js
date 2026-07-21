/**
 * CANARY BLAIR — Open States (Plural) supplemental bio sync
 *
 * Populates members.birth_date and members.gender, and fills members.photo_url
 * ONLY for members our own WV-roster scrape (photos.js) couldn't match — never
 * overwrites a photo we already have, since our own scrape is more current
 * (Open States' cached image paths were observed pointing at 2023/2024
 * filenames vs. our fresh 2025 ones).
 *
 * LegiScan has neither birth_date nor gender; the WV Legislature's own bio
 * pages don't either (checked directly). Open States' `extras.profession`
 * field exists in their schema but was empty for every single WV legislator
 * when checked (0/136) — so profession isn't fetched here; it isn't gettable
 * for this state via this API. Their `/events` endpoint was also checked and
 * has zero upcoming events right now (the session has adjourned) and no
 * bill-linked agenda items in the one inspected — not worth building on yet.
 *
 * Uses ~4 of the free tier's 500 requests/day (jurisdiction is fixed, people
 * fetched at per_page=50 — 3 pages for ~136 WV legislators).
 *
 * Matching is by name (see lib/name-match.js), scoped to the same chamber —
 * same lesson from photos.js: WV Senate districts elect two senators each,
 * so district isn't a safe key.
 *
 * Dry-run by default: prints what would change and writes nothing until you
 * pass --commit.
 *
 * Usage:
 *   node pipeline/openstates-sync.js            # dry run
 *   node pipeline/openstates-sync.js --commit   # write to the database
 */
import 'dotenv/config';
import { normTokens, isNameMatch } from './lib/name-match.js';

const OPENSTATES_API_KEY = process.env.OPENSTATES_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}
if (!OPENSTATES_API_KEY) {
	console.error('Missing OPENSTATES_API_KEY (free key from https://open.pluralpolicy.com/).');
	process.exit(1);
}

const COMMIT = process.argv.includes('--commit');

const OS_BASE = 'https://v3.openstates.org';
const WV_JURISDICTION = 'ocd-jurisdiction/country:us/state:wv/government';

function dbHeaders(extra = {}) {
	return { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY, ...extra };
}

async function fetchMembers() {
	const res = await fetch(
		`${SUPABASE_URL}/rest/v1/members?select=id,full_name,first_name,middle_name,last_name,nickname,chamber,birth_date,gender,photo_url&is_current=eq.true`,
		{ headers: dbHeaders() }
	);
	if (!res.ok) throw new Error(`DB fetch error: ${await res.text()}`);
	return res.json();
}

async function patchMember(memberId, data) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${memberId}`, {
		method: 'PATCH',
		headers: dbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
		body: JSON.stringify(data)
	});
	if (!res.ok) throw new Error(`Patch member ${memberId}: ${await res.text()}`);
}

/** Fetches every WV legislator from Open States (per_page=50, so ~3 requests for ~136 people). */
async function fetchOpenStatesPeople() {
	const people = [];
	let page = 1;
	while (true) {
		const url = `${OS_BASE}/people?jurisdiction=${encodeURIComponent(WV_JURISDICTION)}&per_page=50&page=${page}&apikey=${OPENSTATES_API_KEY}`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Open States /people (page ${page}): HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
		const json = await res.json();
		people.push(...(json.results || []));
		const maxPage = json.pagination?.max_page || 1;
		if (page >= maxPage) break;
		page++;
	}
	return people;
}

const CHAMBER_FROM_ORG = { lower: 'H', upper: 'S' };

function findMatch(member, osPeople) {
	const chamber = member.chamber;
	const pool = osPeople.filter((p) => CHAMBER_FROM_ORG[p.current_role?.org_classification] === chamber);
	const firstNameFields = [member.first_name, member.middle_name, member.nickname];
	const matches = pool.filter((p) => isNameMatch(member.last_name, firstNameFields, normTokens(p.name)));
	return matches.length === 1 ? matches[0] : null; // ambiguous or no match -> skip, don't guess
}

async function run() {
	console.log(`🏛️  Open States bio sync — ${COMMIT ? 'COMMIT (writing to DB)' : 'DRY RUN (no writes)'}\n`);

	console.log('Fetching WV legislators from Open States...');
	const osPeople = await fetchOpenStatesPeople();
	console.log(`  Fetched ${osPeople.length} people\n`);

	const members = await fetchMembers();
	console.log(`${members.length} sitting members to match\n`);

	let birthSet = 0,
		genderSet = 0,
		photoFallback = 0,
		noMatch = 0;

	for (const m of members) {
		const match = findMatch(m, osPeople);
		if (!match) {
			noMatch++;
			continue;
		}

		const patch = {};
		if (!m.birth_date && match.birth_date) {
			patch.birth_date = match.birth_date;
		}
		if (!m.gender && match.gender) {
			patch.gender = match.gender;
		}
		// Photo fallback ONLY when we have no photo at all — our own WV-roster
		// scrape (photos.js) is more current and always takes priority.
		if (!m.photo_url && match.image) {
			patch.photo_url = match.image;
		}

		if (Object.keys(patch).length === 0) continue;

		if (patch.birth_date) birthSet++;
		if (patch.gender) genderSet++;
		if (patch.photo_url) photoFallback++;

		if (!COMMIT) {
			console.log(`   would update ${m.full_name}: ${JSON.stringify(patch)}`);
		} else {
			await patchMember(m.id, patch);
			console.log(`   ✅ ${m.full_name}: ${JSON.stringify(patch)}`);
		}
	}

	console.log(`\n${birthSet} birth dates, ${genderSet} genders, ${photoFallback} fallback photos. ${noMatch} members had no confident Open States match.`);
	if (!COMMIT && (birthSet || genderSet || photoFallback)) console.log('\nRun again with --commit to write these changes.');
}

run().catch((err) => {
	console.error('\n❌ Open States sync failed:', err.message);
	process.exit(1);
});
