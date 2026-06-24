/**
 * CANARY BLAIR — Member Profile Generator
 *
 * Generates AI profile summaries for each legislator using their full
 * voting record, sponsorship data, Canary Score, tier, badges, and
 * alignment breakdown.
 *
 * Usage:
 *   node pipeline/profiles.js                    # all members without a profile
 *   node pipeline/profiles.js --force            # regenerate all profiles
 *   node pipeline/profiles.js --member-id=123    # single member
 *   node pipeline/profiles.js --limit=10         # cap at 10 members
 */
import 'dotenv/config';

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing required environment variables.');
	console.error('   Ensure ANTHROPIC_API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_KEY are set in .env');
	process.exit(1);
}

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1500;

// ─────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────

const args = process.argv.slice(2);
const force = args.includes('--force');
const memberIdArg = args.find((a) => a.startsWith('--member-id='));
const limitArg = args.find((a) => a.startsWith('--limit='));
const targetMemberId = memberIdArg ? parseInt(memberIdArg.split('=')[1]) : null;
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

// ─────────────────────────────────────────
// TIER DATA (matches score.js)
// ─────────────────────────────────────────

const TIER_NAMES = {
	1: 'Mountaineer',
	2: 'Friend of the Holler',
	3: 'Weathervane',
	4: 'Company Man',
	5: 'Rat in the Capitol',
	6: 'Owned'
};

const BADGE_NAMES = {
	'water-protector': 'Water Protector',
	'friend-of-worker': 'Friend of the Worker',
	'lone-canary': 'Lone Canary (votes against own party for the people)',
	'corporate-friend': 'Never Met a Corporation They Didn\'t Like',
	'lockstep': 'Lockstep (votes with party 95%+)',
	'ghost': 'Ghost (absent/not voting 25%+)'
};

// ─────────────────────────────────────────
// SUPABASE HELPERS
// ─────────────────────────────────────────

async function supabaseFetch(path, filter = '') {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${filter ? '?' + filter : ''}`, {
		headers: {
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY
		}
	});
	if (!res.ok) throw new Error(`DB fetch error: ${path}`);
	return res.json();
}

async function supabaseFetchAll(path, filter = '') {
	const rows = [];
	let offset = 0;
	const pageSize = 1000;
	while (true) {
		const sep = filter ? '&' : '';
		const batch = await supabaseFetch(path, `${filter}${sep}offset=${offset}&limit=${pageSize}`);
		rows.push(...batch);
		if (batch.length < pageSize) break;
		offset += pageSize;
	}
	return rows;
}

async function supabasePatch(table, id, data) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY,
			Prefer: 'return=minimal'
		},
		body: JSON.stringify(data)
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Patch ${table} error: ${err}`);
	}
}

// ─────────────────────────────────────────
// CLAUDE API
// ─────────────────────────────────────────

async function callClaude(prompt) {
	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: MAX_TOKENS,
			messages: [{ role: 'user', content: prompt }]
		})
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Claude API error ${res.status}: ${err}`);
	}
	const data = await res.json();
	return data.content[0].text;
}

// ─────────────────────────────────────────
// PROMPT
// ─────────────────────────────────────────

function buildPrompt(member, summary, sponsoredBills, keyVotes) {
	const chamber = member.chamber === 'H' ? 'House of Delegates' : 'Senate';
	const tierName = TIER_NAMES[member.canary_tier] || 'Unscored';
	const badges = (member.canary_badges || []).map(b => BADGE_NAMES[b] || b).join(', ') || 'None';

	// Separate key votes into "helped score" and "hurt score"
	// Good: Yea on for_people, Nay on for_capital
	// Bad: Nay on for_people, Yea on for_capital
	const helpedScore = [];
	const hurtScore = [];
	for (const v of keyVotes) {
		const b = v.bills;
		if (!b || !b.ai_alignment || b.ai_alignment === 'neutral') continue;
		const impactLabel = b.ai_impact_tier === 1 ? 'LANDMARK'
			: b.ai_impact_tier === 2 ? 'HIGH IMPACT'
			: 'MEANINGFUL';
		const entry = `- ${v.vote_text} on ${b.bill_number}: "${b.title}" [${impactLabel}]`;
		if ((b.ai_alignment === 'for_people' && v.vote_value === 1) ||
			(b.ai_alignment === 'for_capital' && v.vote_value === 2)) {
			helpedScore.push(entry);
		} else if ((b.ai_alignment === 'for_people' && v.vote_value === 2) ||
			(b.ai_alignment === 'for_capital' && v.vote_value === 1)) {
			hurtScore.push(entry);
		}
	}

	// Sponsored bills — separate by alignment, prioritize primary sponsors and high-impact
	const peopleSponsor = [];
	const capitalSponsor = [];
	for (const s of sponsoredBills) {
		const b = s.bills;
		if (!b) continue;
		const type = s.sponsor_type === 1 ? 'Primary sponsor' : 'Cosponsor';
		const entry = `- ${type}: ${b.bill_number} "${b.title}"`;
		if (b.ai_alignment === 'for_people') peopleSponsor.push(entry);
		else if (b.ai_alignment === 'for_capital') capitalSponsor.push(entry);
	}

	const helpedSection = helpedScore.length > 0
		? helpedScore.slice(0, 15).join('\n')
		: 'None on record.';
	const hurtSection = hurtScore.length > 0
		? hurtScore.slice(0, 15).join('\n')
		: 'None on record.';
	const peopleSponsorSection = peopleSponsor.length > 0
		? peopleSponsor.slice(0, 10).join('\n')
		: 'None.';
	const capitalSponsorSection = capitalSponsor.length > 0
		? capitalSponsor.slice(0, 10).join('\n')
		: 'None.';

	return `You are Canary Blair — a civic accountability tool for West Virginia residents.
Write an honest, factual profile of this legislator's record. Be direct and clear.
Write for ordinary West Virginians, not political insiders.

HOW SCORING WORKS:
The Canary Score (0-100) is weighted by bill impact. A landmark bill that affects thousands
of lives counts 5x more than routine legislation and 20x more than ceremonial resolutions.
This means a legislator can vote "yes" on many low-impact people-friendly bills while still
scoring low if they consistently vote against the people on the bills that matter most.
Sponsorship counts even more than voting — putting your name on a bill shows what you
actively champion, not just what you'll go along with.

LEGISLATOR:
Name: ${member.full_name}
Party: ${member.party === 'D' ? 'Democrat' : member.party === 'R' ? 'Republican' : member.party}
Chamber: ${chamber}
District: ${member.district || 'Unknown'}
${member.next_election ? `Next election: ${member.next_election}` : ''}

CANARY SCORE: ${member.canary_score != null ? member.canary_score + '/100' : 'Not yet scored'}
Tier: ${tierName}
Badges: ${badges}
${summary?.absent_count > 0 ? `Absent/Not voting: ${(summary.not_voting_count || 0) + (summary.absent_count || 0)} out of ${summary.total_votes || 0} votes` : ''}

VOTES THAT HELPED THEIR SCORE (voted for people or against corporate interests on important bills):
${helpedSection}

VOTES THAT HURT THEIR SCORE (voted against people or for corporate interests on important bills):
${hurtSection}

BILLS THEY SPONSOR THAT HELP PEOPLE:
${peopleSponsorSection}

BILLS THEY SPONSOR THAT HELP CORPORATIONS:
${capitalSponsorSection}

Write a 4-6 sentence profile. Focus on:
1. What the HIGH-IMPACT votes reveal — these matter most. Reference specific bills by name when they tell a clear story.
2. What their sponsorship pattern shows about their real priorities.
3. Any notable patterns from their badges (e.g., lockstep voter, ghost, lone canary).
4. What this means for their constituents in plain terms.

Do NOT cite raw vote percentages or counts. Do NOT say "X% of the time."
Instead, describe WHAT they voted for and against on the bills that matter.
Be factual. Don't repeat the score number. Don't use the word "mixed."
Respond with plain text only. No markdown, no JSON, no bullet points.`.trim();
}

// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────

async function run() {
	const startTime = Date.now();
	console.log('👤 Canary Blair Member Profile Generator\n');
	console.log(`   Model: ${MODEL}`);
	console.log(`   Force regenerate: ${force}`);
	if (targetMemberId) console.log(`   Target member: ${targetMemberId}`);
	if (limit) console.log(`   Limit: ${limit}`);
	console.log('');

	// ── Fetch members ──────
	let members;
	if (targetMemberId) {
		members = await supabaseFetch('members',
			`select=id,full_name,party,chamber,district,canary_score,canary_tier,canary_badges,next_election,ai_profile_summary&id=eq.${targetMemberId}`
		);
	} else {
		let filter = 'select=id,full_name,party,chamber,district,canary_score,canary_tier,canary_badges,next_election,ai_profile_summary';
		if (!force) filter += '&ai_profile_summary=is.null';
		filter += '&order=canary_score.desc.nullslast';
		if (limit) filter += `&limit=${limit}`;
		members = await supabaseFetch('members', filter);
	}

	console.log(`📋 Found ${members.length} members to profile\n`);
	if (members.length === 0) {
		console.log('Nothing to do!');
		return;
	}

	let success = 0;
	let failed = 0;

	for (let i = 0; i < members.length; i++) {
		const member = members[i];

		try {
			// Fetch vote summary
			const summaryArr = await supabaseFetch('member_vote_summary',
				`select=*&member_id=eq.${member.id}`
			);
			const summary = summaryArr[0] || null;

			// Fetch sponsored bills with alignment data
			const sponsored = await supabaseFetch('bill_sponsors',
				`select=sponsor_type,bills(bill_number,title,ai_alignment,ai_impact_tier)&member_id=eq.${member.id}&order=bill_id.desc&limit=30`
			);

			// Fetch votes on high-impact bills (tier 1-3) — these drive the score
			const keyVotes = await supabaseFetch('votes',
				`select=vote_text,vote_value,bills(bill_number,title,ai_alignment,ai_impact_tier)&member_id=eq.${member.id}&order=created_at.desc&limit=200`
			);
			// Filter to only high-impact votes where the bill join returned data
			const filteredKeyVotes = keyVotes.filter(v =>
				v.bills && v.bills.bill_number && v.bills.ai_impact_tier && v.bills.ai_impact_tier <= 3
			);

			const prompt = buildPrompt(member, summary, sponsored, filteredKeyVotes);
			const profile = await callClaude(prompt);

			await supabasePatch('members', member.id, {
				ai_profile_summary: profile.trim(),
				ai_profile_updated_at: new Date().toISOString()
			});

			success++;
			console.log(`   ✅ [${i + 1}/${members.length}] ${member.full_name} (${member.party}) — ${member.canary_score || '?'}`);

			// Small delay between API calls
			if (i < members.length - 1) {
				await new Promise((r) => setTimeout(r, 200));
			}
		} catch (err) {
			failed++;
			console.error(`   ❌ [${i + 1}/${members.length}] ${member.full_name}: ${err.message}`);
		}
	}

	const duration = Date.now() - startTime;
	const mins = Math.floor(duration / 60000);
	const secs = Math.floor((duration % 60000) / 1000);

	console.log('\n═══════════════════════════════════════');
	console.log('✅ Profile generation complete!');
	console.log(`   Generated: ${success}`);
	console.log(`   Failed:    ${failed}`);
	console.log(`   Duration:  ${mins}m ${secs}s`);
	console.log('═══════════════════════════════════════');
}

run().catch((err) => {
	console.error('\n❌ Profile generation failed:', err.message);
	process.exit(1);
});
