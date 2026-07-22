/**
 * CANARY BLAIR — Committee membership scrape (WV Legislature committee pages)
 *
 * Populates committee_memberships (schema/019): who chairs and sits on each
 * standing committee. LegiScan has no roster data. The WV Legislature's own
 * committee pages list Chair / Vice-Chair / Minority Chair / members, each
 * linked to the member — so we scrape those.
 *
 * This is the data that makes the Graveyard attributable: a committee chair
 * controls that committee's agenda, so bills that die there without a vote
 * are the chair's call.
 *
 * Members are matched to our DB by name (lib/name-match.js), scoped to the
 * committee's chamber. Unmatched names are stored with member_id=null (still
 * useful for display; the chair match is what matters and chairs are
 * prominent, well-known names).
 *
 * Dry-run by default; --commit to write.
 *
 * Usage:
 *   node pipeline/committee-scrape.js            # dry run
 *   node pipeline/committee-scrape.js --commit   # write
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

const INDEXES = [
	{ chamber: 'H', url: 'https://www.wvlegislature.gov/committees/House/main.cfm', comPath: 'House/HouseCommittee.cfm' },
	{ chamber: 'S', url: 'https://www.wvlegislature.gov/committees/senate/main.cfm', comPath: 'senate/SenateCommittee.cfm' }
];

const ROLE_MAP = [
	[/minority\s*vice[-\s]*chair/i, 'minority_vice_chair'],
	[/minority\s*chair/i, 'minority_chair'],
	[/vice[-\s]*chair/i, 'vice_chair'],
	[/\bchair\b/i, 'chair']
];

function dbHeaders(extra = {}) {
	return { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY, ...extra };
}

async function fetchMembers() {
	const res = await fetch(
		`${SUPABASE_URL}/rest/v1/members?select=id,full_name,first_name,middle_name,last_name,nickname,chamber&is_current=eq.true`,
		{ headers: dbHeaders() }
	);
	if (!res.ok) throw new Error(`DB fetch error: ${await res.text()}`);
	return res.json();
}

/** Chart codes + committee names from a chamber's committee index. */
function parseIndex(html) {
	const out = [];
	const seen = new Set();
	for (const m of html.matchAll(/Committee\.cfm\?Chart=([a-z0-9]+)"[^>]*>([^<]+)</gi)) {
		const chart = m[1].toLowerCase();
		if (seen.has(chart)) continue;
		seen.add(chart);
		out.push({ chart, name: m[2].trim() });
	}
	return out;
}

/**
 * Parse a committee page's member list. Rows look like:
 *   <a href="...lawmaker.cfm?member=Delegate Akers">Delegate Akers</a> - <strong>Chair</strong>
 *   <a href="...lawmaker.cfm?member=Delegate Butler">Delegate Butler</a>   (plain member)
 */
function parseCommittee(html) {
	const rows = [];
	// Restrict to the members block to avoid nav links.
	const start = html.search(/<h2[^>]*>\s*Members/i);
	const block = start === -1 ? html : html.slice(start);
	const end = block.search(/<\/div>\s*<div id="wraprightcol/i);
	const scoped = end === -1 ? block : block.slice(0, end);

	for (const m of scoped.matchAll(/lawmaker\.cfm\?member=([^"]+)"[^>]*>([^<]+)<\/a>\s*(?:-\s*<strong>([^<]+)<\/strong>)?/gi)) {
		const display = m[2].trim();
		const roleText = (m[3] || '').trim();
		let role = 'member';
		for (const [re, r] of ROLE_MAP) if (re.test(roleText)) { role = r; break; }
		rows.push({ display, role });
	}
	return rows;
}

/** Match a scraped "Delegate Akers" / "Senator Maynard, M." display to a DB member in `chamber`. */
function matchMember(display, members, chamber) {
	const noTitle = display.replace(/^(Delegate|Senator|Speaker|President|Mr\.?|Ms\.?)\s+/i, '').trim();
	// A trailing ", X." is a first-initial disambiguator among same-surname members
	// (e.g. "Cannon, J." = Jarred, not David). Capture it, then strip for the last name.
	const initialMatch = noTitle.match(/,\s*([A-Za-z])\.?$/);
	const initial = initialMatch ? initialMatch[1].toLowerCase() : null;
	const lastOnly = noTitle.replace(/,\s*[A-Za-z]\.?$/, '').trim();
	const tokens = normTokens(lastOnly);

	const pool = members.filter((mm) => mm.chamber === chamber);
	let candidates = pool.filter((mm) => normTokens(mm.last_name).every((t) => tokens.includes(t)));
	// Disambiguate a shared surname by the first-initial hint when present.
	if (candidates.length > 1 && initial) {
		const byInitial = candidates.filter((mm) => {
			const fns = [mm.first_name, mm.nickname].filter(Boolean);
			return fns.some((fn) => fn[0]?.toLowerCase() === initial);
		});
		if (byInitial.length === 1) return byInitial[0];
	}
	if (candidates.length === 1) return candidates[0];
	// Fall back to the fuller name matcher if the display carried a first name too.
	const strict = pool.filter((mm) => isNameMatch(mm.last_name, [mm.first_name, mm.middle_name, mm.nickname], normTokens(noTitle)));
	return strict.length === 1 ? strict[0] : null;
}

const pause = (ms = 150) => new Promise((r) => setTimeout(r, ms));

async function run() {
	console.log(`🏛️  Committee membership scrape — ${COMMIT ? 'COMMIT' : 'DRY RUN'}\n`);
	const members = await fetchMembers();

	const rows = [];
	for (const { chamber, url, comPath } of INDEXES) {
		const idxHtml = await (await fetch(url)).text();
		const committees = parseIndex(idxHtml);
		console.log(`${chamber === 'H' ? 'House' : 'Senate'}: ${committees.length} committees`);
		for (const c of committees) {
			const comUrl = `https://www.wvlegislature.gov/committees/${comPath}?Chart=${c.chart}`;
			try {
				const html = await (await fetch(comUrl)).text();
				const roster = parseCommittee(html);
				for (const person of roster) {
					const matched = matchMember(person.display, members, chamber);
					rows.push({
						committee_key: `${chamber}:${c.chart}`,
						committee_name: c.name,
						chamber,
						member_id: matched?.id ?? null,
						member_display: person.display,
						role: person.role,
						source_url: comUrl,
						updated_at: new Date().toISOString()
					});
				}
				const chair = roster.find((p) => p.role === 'chair');
				console.log(`  ${c.name.padEnd(38)} ${roster.length} members${chair ? ` — chair: ${chair.display}` : ' — NO CHAIR PARSED'}`);
			} catch (err) {
				console.warn(`  ⚠ ${c.name}: ${err.message}`);
			}
			await pause();
		}
	}

	const chairs = rows.filter((r) => r.role === 'chair');
	const chairsMatched = chairs.filter((r) => r.member_id != null).length;
	const totalMatched = rows.filter((r) => r.member_id != null).length;
	console.log(`\n${rows.length} membership rows across all committees.`);
	console.log(`Chairs: ${chairs.length} parsed, ${chairsMatched} matched to a DB member.`);
	console.log(`All roles: ${totalMatched}/${rows.length} matched to a DB member.`);

	if (!COMMIT) {
		console.log('\nDry run — run with --commit to write.');
		return;
	}

	// Replace the whole table (memberships change wholesale between scrapes).
	const del = await fetch(`${SUPABASE_URL}/rest/v1/committee_memberships?id=gt.0`, { method: 'DELETE', headers: dbHeaders({ Prefer: 'return=minimal' }) });
	if (!del.ok) throw new Error(`Delete failed: ${await del.text()}`);
	for (let i = 0; i < rows.length; i += 200) {
		const res = await fetch(`${SUPABASE_URL}/rest/v1/committee_memberships`, {
			method: 'POST',
			headers: dbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
			body: JSON.stringify(rows.slice(i, i + 200))
		});
		if (!res.ok) throw new Error(`Insert failed: ${await res.text()}`);
	}
	console.log(`\n✅ Wrote ${rows.length} committee membership rows.`);
}

run().catch((err) => {
	console.error('\n❌ Committee scrape failed:', err.message);
	process.exit(1);
});
