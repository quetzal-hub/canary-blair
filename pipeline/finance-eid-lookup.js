/**
 * CANARY BLAIR — FollowTheMoney entity-id bulk lookup
 *
 * Automates most of what finance-eid-export.js otherwise asks a human to do
 * by hand. FollowTheMoney's Ask Anything API has no name-search FILTER, but
 * grouping by career summary (gro=c-t-eid) surfaces the STABLE per-person
 * eid for every candidate matching a filter — e.g. every WV House/Senate
 * candidate in a given election year — in one paginated sweep. No name has
 * to be known in advance.
 *
 * IMPORTANT: group by c-t-eid ("Career Summary"), NOT c-t-id ("Candidate").
 * c-t-id is a per-RACE id — the same person gets a different one each
 * election cycle — while c-t-eid is the stable per-person id that spans
 * years, which is what finance.js actually queries with. Grouping by c-t-id
 * first produced a wall of false "ambiguous" results: the same person's
 * 2024-run id and 2022-run id look like two different people if you don't
 * know the two tokens mean different things.
 *
 * WV House members serve 2-year terms (all elected in the same even year);
 * WV Senate seats are staggered 4-year terms (elected in EITHER of two
 * election cycles), so this checks both the current and prior election year
 * to cover the whole sitting Senate.
 *
 * Matching is by name (see lib/name-match.js) within the correct chamber —
 * exactly as conservative as finance-eid-export.js's original human-driven
 * process: a member only gets an eid here if exactly one distinct candidate
 * matches. Zero matches or multiple distinct candidates matching the same
 * name are left for a human to resolve by hand — never guessed.
 *
 * This EDITS finance-eids.csv in place: any eid a human already filled in is
 * left untouched; only still-blank rows get a confident automatic match.
 * Run finance-eid-export.js first if you don't have a CSV yet.
 *
 * Usage:
 *   node pipeline/finance-eid-lookup.js                        # updates finance-eids.csv
 *   node pipeline/finance-eid-lookup.js --csv=other.csv         # custom path
 *   node pipeline/finance-eid-lookup.js --years=2024,2022,2020  # custom election years
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseCsv, toCsvRow } from './lib/csv.js';
import { normTokens, isNameMatch } from './lib/name-match.js';

const FTM_API_KEY = process.env.FTM_API_KEY || process.env.OPENSECRETS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}
if (!FTM_API_KEY) {
	console.error('Missing FTM_API_KEY (free key from https://www.followthemoney.org).');
	process.exit(1);
}

const args = process.argv.slice(2);
const csvArg = args.find((a) => a.startsWith('--csv='));
const CSV_PATH = csvArg ? csvArg.split('=')[1] : 'finance-eids.csv';
const yearsArg = args.find((a) => a.startsWith('--years='));
const YEARS = yearsArg ? yearsArg.split('=')[1].split(',').map((y) => y.trim()) : ['2024', '2022'];

const FTM_BASE = 'https://api.followthemoney.org';
const STATE = 'WV';

const pause = (ms = 200) => new Promise((r) => setTimeout(r, ms));

/** LegiScan chamber code -> FollowTheMoney office-type code (verified live: H=House, S=Senate). */
const CHAMBER_TO_OFFICE = { H: 'H', S: 'S' };

/**
 * Parses FollowTheMoney's "LASTNAME, FIRST MIDDLE (NICKNAME)" candidate name
 * into a flat token pool covering last name, given names, and any
 * parenthetical nickname — everything isNameMatch needs to check both sides.
 */
function candidateTokens(rawName) {
	const [last = '', rest = ''] = rawName.split(',');
	const nickMatch = rest.match(/\(([^)]+)\)/);
	const given = rest.replace(/\([^)]*\)/, '');
	return normTokens(`${last} ${given} ${nickMatch ? nickMatch[1] : ''}`);
}

/**
 * Fetches every candidate's STABLE eid (c-t-eid, "Career Summary") for WV
 * House+Senate races in one election year, paginated. Grouping by c-t-eid
 * (not c-t-id) means a person who ran in both checked years yields the same
 * eid both times — the caller dedupes by eid across years, so that collapses
 * to one match instead of a false "ambiguous, 2 different ids" result.
 */
async function fetchCandidates(year) {
	const results = [];
	let page = 0;
	while (true) {
		const url = `${FTM_BASE}/?gro=c-t-eid,c-r-ot&s=${STATE}&y=${year}&c-r-ot=H,S&p=${page}&APIKey=${FTM_API_KEY}&mode=json`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`FTM candidate list (${year}, p=${page}): HTTP ${res.status}`);
		const json = await res.json();
		if (json.error) throw new Error(`FTM API error: ${json.error}`);
		for (const rec of json.records || []) {
			const career = rec.Career_Summary;
			const office = rec.General_Office;
			if (!career?.id || !office?.id) continue;
			results.push({ eid: career.id, name: career.Career_Summary, chamber: office.id, year });
		}
		const totalPages = Number(json.metaInfo?.paging?.totalPages || 1);
		page++;
		if (page >= totalPages) break;
		await pause();
	}
	return results;
}

async function fetchMembers() {
	const res = await fetch(
		`${SUPABASE_URL}/rest/v1/members?select=id,full_name,first_name,middle_name,last_name,nickname,chamber&is_current=eq.true`,
		{ headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
	);
	if (!res.ok) throw new Error(`DB fetch error: ${await res.text()}`);
	return res.json();
}

async function run() {
	console.log(`💰 FollowTheMoney bulk eid lookup — years ${YEARS.join(', ')}\n`);

	if (!existsSync(CSV_PATH)) {
		console.error(`${CSV_PATH} not found. Run finance-eid-export.js first.`);
		process.exit(1);
	}

	const allCandidates = [];
	for (const year of YEARS) {
		console.log(`Fetching WV House/Senate candidates for ${year}...`);
		const candidates = await fetchCandidates(year);
		console.log(`  ${candidates.length} candidate records`);
		allCandidates.push(...candidates);
		await pause();
	}

	const byChamber = { H: [], S: [] };
	for (const c of allCandidates) {
		if (byChamber[c.chamber]) byChamber[c.chamber].push(c);
	}

	const members = await fetchMembers();
	const memberById = new Map(members.map((m) => [String(m.id), m]));

	const csvRows = parseCsv(readFileSync(CSV_PATH, 'utf8'));
	const header = ['member_id', 'full_name', 'party', 'chamber', 'district', 'eid'];

	let filled = 0,
		alreadySet = 0,
		noMatch = 0,
		ambiguous = 0,
		notInDb = 0;

	const outRows = [header];
	for (const row of csvRows) {
		const member = memberById.get(String(row.member_id));
		if (!member) {
			outRows.push([row.member_id, row.full_name, row.party, row.chamber, row.district, row.eid || '']);
			notInDb++;
			continue;
		}

		if (row.eid && row.eid.trim()) {
			outRows.push([row.member_id, row.full_name, row.party, row.chamber, row.district, row.eid]);
			alreadySet++;
			continue;
		}

		const pool = byChamber[member.chamber] || [];
		const firstNameFields = [member.first_name, member.middle_name, member.nickname];
		const matches = pool.filter((c) => isNameMatch(member.last_name, firstNameFields, candidateTokens(c.name)));
		const distinctEids = [...new Set(matches.map((m) => m.eid))];

		if (distinctEids.length === 1) {
			outRows.push([row.member_id, row.full_name, row.party, row.chamber, row.district, distinctEids[0]]);
			filled++;
			console.log(`   ✅ ${member.full_name} -> eid ${distinctEids[0]} (matched "${matches[0].name}", ${matches[0].year})`);
		} else if (distinctEids.length === 0) {
			outRows.push([row.member_id, row.full_name, row.party, row.chamber, row.district, '']);
			noMatch++;
			console.warn(`   ⚠ ${member.full_name}: no candidate match in ${YEARS.join('/')} — leave blank or look up by hand`);
		} else {
			outRows.push([row.member_id, row.full_name, row.party, row.chamber, row.district, '']);
			ambiguous++;
			const options = distinctEids.map((eid) => `${eid} (${matches.find((m) => m.eid === eid).name})`).join(', ');
			console.warn(`   ⚠ ${member.full_name}: ambiguous — multiple candidates matched: ${options}. Left blank — pick manually.`);
		}
	}

	writeFileSync(CSV_PATH, outRows.map(toCsvRow).join('\n') + '\n', 'utf8');

	console.log(`\n${filled} filled automatically, ${alreadySet} already had an eid (untouched), ${noMatch} no match, ${ambiguous} ambiguous, ${notInDb} not in DB.`);
	console.log(`\nUpdated ${CSV_PATH}. Review it, then:`);
	console.log(`  node pipeline/finance-eid-import.js ${CSV_PATH}            # dry run`);
	console.log(`  node pipeline/finance-eid-import.js ${CSV_PATH} --commit   # write to the database`);
}

run().catch((err) => {
	console.error('\n❌ Lookup failed:', err.message);
	process.exit(1);
});
