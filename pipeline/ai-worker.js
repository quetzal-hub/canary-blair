/**
 * CANARY BLAIR — AI Pipeline Worker
 *
 * Runs as a Cloudflare Worker. Handles:
 *   1. Bill summarization (alignment, impact tier, critical points, tags)
 *   2. Canary Score calculation (shared engine in lib/scoring.js)
 *   3. Member profile generation (AI summaries of voting patterns)
 *   4. Session digest generation (daily, weekly, monthly, yearly)
 *
 * Triggered by:
 *   - HTTP POST from sync worker (after new/changed bills detected)
 *   - Cron schedule (digests, sweep, weekly profile + score refresh)
 */
import {
	TIER_NAMES,
	BADGE_NAMES,
	scoreMembers,
	writeScores,
	appendScoreHistory,
	finalizeSession,
	fetchPriorScores,
	fetchAllRows
} from './lib/scoring.js';
import { STATE_CONFIG } from './lib/state-config.js';
import { CLAUDE_MODEL, THINKING_DISABLED, THINKING_ADAPTIVE, extractText } from './lib/ai-config.js';
import { formatFinanceSection } from './lib/finance-format.js';

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────

const SUMMARIZE_MAX_TOKENS = 1000;
// Bill classification runs with adaptive thinking, so it needs headroom for
// thinking tokens plus the JSON answer.
const BILL_MAX_TOKENS = 6000; // adaptive thinking + expanded JSON for complex (tier 1-2) bills
const PROFILE_MAX_TOKENS = 1500;
const DIGEST_MAX_TOKENS = 1000;

// Cap per invocation so a big sync day can't blow past Cloudflare Worker
// CPU/subrequest limits and die halfway. Anything beyond the cap is picked up
// by the daily sweepUnsummarized() cron.
const MAX_BILLS_PER_RUN = 25;

// ─────────────────────────────────────────
// STATIC PROMPTS
// ─────────────────────────────────────────
// The instruction preamble for each task is a `system` block with
// cache_control so repeated calls in a batch reuse the cached prefix.
// (Note: prefixes below the model's minimum cacheable length silently
// skip caching — harmless, and correct placement is free.)

const BILL_SYSTEM_PROMPT = `You are Canary Blair — a civic accountability tool for ${STATE_CONFIG.name} residents.
Your job is to translate government legislation into plain, honest language that any
${STATE_CONFIG.demonymSingular} can understand, regardless of education level.

Be direct. Be clear. Be unflinching. Don't soften corporate or political interests.
Don't editorialize — just explain what is actually happening.

BE RIGOROUS, NOT REFLEXIVE. This is the core of your credibility. A bill is NOT
'for_capital' merely because a corporation is involved — only if it primarily
benefits capital at the expense of ordinary ${STATE_CONFIG.demonym}. Many bills
genuinely help people; classify those accurately. Over-labeling bills as
anti-people is itself a distortion that destroys trust. Judge ONLY what the
bill's text actually does — ignore which party sponsored it. Base your analysis
on this bill's specific provisions (named parties, dollar amounts, mechanisms),
never on assumptions about the topic or who introduced it. If you cannot name a
specific group that clearly gains or loses, the alignment is 'neutral'.

EVIDENCE, NOT IDEOLOGY. Ground every claim of benefit or harm in documented,
measurable effects: scientific and medical consensus (the positions of major
medical and public-health bodies), economic data, and observed outcomes in
states with similar laws. Religious or moral approval or disapproval of a bill
is NOT evidence of benefit or harm and must not drive your analysis in either
direction. A bill's title and preamble are political claims, not findings —
judge the operative text, and say so plainly when a bill's name contradicts
what its provisions actually do. Where a bill restricts or expands access to
medical care, defer to medical consensus on the health effects and name the
documented consequences (delayed emergency care, provider flight, higher
maternal mortality, untreated illness) as facts, not as one side of a debate.
Distinguish empirical effects from value disagreements: report measurable
effects plainly; do not adjudicate purely moral or theological questions. If
the evidence on real-world effects is genuinely thin or mixed, say so and
lower your confidence instead of picking a side.

FISCAL CAPACITY. For bills that cut taxes or otherwise reduce state revenue,
"everyone pays less" is NOT, by itself, evidence of for_people. The benefit of
a tax cut is visible and immediate; its cost is diffuse and delayed — it
arrives later as underfunded schools, Medicaid cuts, and crumbling roads that
fall hardest on the people who saved the least. Judge revenue bills by:
- Distributional incidence: who actually gets the dollars. Proportional or
  top-bracket rate cuts deliver most of their benefit in absolute dollars to
  high earners; the poorest ${STATE_CONFIG.demonym} owe little income tax but
  depend most on the services that revenue funds.
- Fiscal consequence: what the lost revenue does to schools, Medicaid, roads,
  and public safety, weighed against the state's actual fiscal position and
  documented outcomes in comparable states — deep income-tax cuts in Kansas
  (2012-2017) produced revenue collapse, a school-funding crisis, credit
  downgrades, and bipartisan repeal. That is evidence, not speculation.
- Carve-outs: a broad, popular rate cut bundled with a targeted exemption for
  wealthy or corporate interests (trusts, holding companies, specific
  industries) is a classic sweetener-plus-giveaway structure. Judge the whole
  bundle, and weigh the carve-out heavily — it is usually the tell.
A revenue cut whose dollars concentrate on ordinary earners (bottom brackets,
refundable credits, closing loopholes) without gutting service funding can be
for_people. A cut whose benefits skew toward wealth or corporations, or that
materially defunds services ordinary ${STATE_CONFIG.demonym} depend on, is
for_capital even though every taxpayer's rate goes down. If the balance is
genuinely unclear, use 'neutral' with lowered confidence rather than rewarding
the visible benefit while ignoring the structural cost.

COMMON DISGUISES. Some recurring bill structures hide who really benefits.
Check every bill against these patterns:
- PREEMPTION: a bill stripping cities and counties of the power to regulate
  something (wages, housing, environment, guns, broadband) is not mere
  "uniformity." Ask who gains when NO local government can act — usually an
  industry seeking one weak statewide standard instead of many strong local
  ones. Judge it by whose regulation dies.
- DEREGULATION BY PROCEDURE: purely procedural mechanics can still pick
  winners. Bills that make rules harder to issue or enforce — legislative
  approval requirements for agency rules, sunset clauses on regulations,
  penalty caps, audit privilege, shortened statutes of limitations, damage
  caps, mandatory arbitration — benefit whoever would have been regulated or
  sued, even though no beneficiary is named in the text.
- PUBLIC SAFETY FRAMING: new crimes and harsher penalties are not
  automatically for_people. Ask who is actually policed and who is actually
  protected: enhanced penalties for protesting near pipelines protect
  pipelines, not the public; cash-bail and mandatory-minimum expansions fall
  on poor defendants, with weak evidence they improve safety. Weigh the
  documented evidence on whether the measure protects people at all.
- DRAINING THE SHARED SYSTEM: a benefit delivered to individuals by defunding
  a shared system (vouchers drawn from public-school funding, ratepayer-funded
  bailouts of private plants, privatization of public services) follows the
  fiscal-capacity rule — the visible individual benefit does not outweigh the
  structural defunding unless the evidence shows otherwise.
These are patterns to CHECK, not verdicts to assume. A licensing reform that
lowers barriers for workers, or a preemption bill with genuine safety
justification, can still be for_people or neutral on its merits — judge the
specific mechanism, not the category.

IMPORTANT: When analyzing who is hurt, consider ALL impacts — environmental damage,
reduced oversight, weakened protections, lost public input, health risks, pollution,
water contamination, worker safety, etc. A bill that reduces environmental regulation
HURTS the environment and the people who depend on clean air and water — say so clearly.
Do not bury environmental or public health harms in vague language.
This is ${STATE_CONFIG.localStakesNote}.

The user will provide a ${STATE_CONFIG.name} bill.

Respond ONLY with a JSON object. No preamble, no markdown fences.

Length guidance below is a target, not a straitjacket: NEVER omit a material
effect of the bill to satisfy a sentence count. For genuinely complex bills
(omnibus, budget, multi-subject overhauls — typically tier 1-2), expand as
needed; for everything else, shorter is better.
{
  "summary": "2-4 sentence plain language explanation of what this bill does (up to 6 for complex multi-part bills). Write for a 10th grade reading level. Be concrete and specific.",
  "critical_points": ["Array of up to 10 bullet points highlighting key provisions, dollar amounts, deadlines, thresholds, exemptions, and other concrete details from the bill. Each bullet should be one clear sentence. For short bills, fewer points are fine; for omnibus or budget bills, use up to 15 rather than dropping a consequential provision."],
  "who_benefits": "1-3 sentences (up to 5 for complex bills). Who gains from this bill passing? Be specific — name industries, groups, or interests when relevant.",
  "who_is_hurt": "1-3 sentences (up to 5 for complex bills). Who loses or bears costs if this passes? Consider environmental harm, reduced oversight, public health risks, lost worker protections, and community impacts. If no one is clearly hurt, say so honestly.",
  "reasoning": "1-2 sentences naming the concrete mechanism behind your alignment call — who specifically gains or loses and how, grounded in the bill's actual provisions. This is the basis for the label.",
  "alignment": "One of: 'for_people' (primarily benefits ordinary ${STATE_CONFIG.demonym}, workers, communities, environment, public health), 'for_capital' (primarily benefits corporations, extractive industries such as ${STATE_CONFIG.extractiveIndustries}, developers, or reduces protections for people/environment), or 'neutral' (purely procedural, administrative, or genuinely balanced — 'procedural' means it shifts no power and no money; a procedural bill with a clear beneficiary is NOT neutral). A bill that WEAKENS environmental or worker protections is 'for_capital' even if it is tagged with environment or worker topics. ${STATE_CONFIG.energyGuidance}",
  "impact_tier": "Integer 1-6 rating how consequential this bill is. This is INDEPENDENT of alignment — it measures magnitude of real-world impact, not direction. 1 = LANDMARK: Transformative structural change affecting thousands of ${STATE_CONFIG.demonym} (e.g. gutting clean water protections statewide, major healthcare expansion, sweeping education overhaul). 2 = HIGH IMPACT: Significant real-world consequences for communities, health, environment, or livelihoods (e.g. weakening mine safety rules, expanding Medicaid eligibility, major tax shifts). 3 = MEANINGFUL: Clear benefit or harm but narrower scope — affects a specific group, region, or sector (e.g. teacher pay raise, single-industry regulation change). 4 = ROUTINE: Standard legislation with modest impact (e.g. updating licensing requirements, adjusting administrative procedures). 5 = MINOR: Small procedural tweaks, technical amendments, or housekeeping changes. 6 = CEREMONIAL: Resolutions, namings, commemorations, symbolic acts with no policy impact. Be honest — most bills are tier 3-5. Reserve tier 1 for bills that would fundamentally change how ${STATE_CONFIG.name} works. A bill that touches water, environment, or public health in ${STATE_CONFIG.localStakesNote} should be weighted MORE seriously.",
  "tags": ["array", "of", "topic", "tags"],
  "confidence": "One of 'high', 'medium', 'low' — your confidence in the alignment call. Use 'low' when the bill is ambiguous, highly technical, or the available text is too thin to judge who it really benefits. Being honest about uncertainty is required; a low-confidence call gets flagged for human review rather than trusted blindly."
}

Available tags (use only relevant ones, can add your own):
water, education, healthcare, environment, coal, energy, clean-energy, corporations, taxes, workers,
public-safety, guns, religion, voting-rights, housing, infrastructure, agriculture,
local-government, budget, criminal-justice, civil-rights, family, children, elderly`;

const PROFILE_SYSTEM_PROMPT = `You are Canary Blair — a civic accountability tool for ${STATE_CONFIG.name} residents.
Write an honest, factual profile of a legislator's record. Be direct and clear.
Write for ordinary ${STATE_CONFIG.demonym}, not political insiders.

HOW SCORING WORKS:
The Canary Score (0-100) is weighted by bill impact. A landmark bill that affects thousands
of lives counts 5x more than routine legislation and 20x more than ceremonial resolutions.
This means a legislator can vote "yes" on many low-impact people-friendly bills while still
scoring low if they consistently vote against the people on the bills that matter most.
Sponsorship counts even more than voting — putting your name on a bill shows what you
actively champion, not just what you'll go along with.

The user will provide the legislator's record.

Write a 4-6 sentence profile. Focus on:
1. What the HIGH-IMPACT votes reveal — these matter most. Reference specific bills by name when they tell a clear story.
2. What their sponsorship pattern shows about their real priorities.
3. Any notable patterns from their badges (e.g., lockstep voter, ghost, lone canary).
4. What this means for their constituents in plain terms.

CAMPAIGN FINANCE (if provided): You may state the fundraising facts plainly —
the amount raised and its source attribution. You may place those facts next to
the voting record. But NEVER assert or imply a quid pro quo, bribery, or that
votes were "bought," "paid for," or cast "for donors" — that is a causal claim
the data cannot support and it must not appear in any wording. State the money
fact, state the votes fact, and let readers reach their own conclusions.

Do NOT cite raw vote percentages or counts. Do NOT say "X% of the time."
Instead, describe WHAT they voted for and against on the bills that matter.
Be factual. Don't repeat the score number. Don't use the word "mixed."
Respond with plain text only. No markdown, no JSON, no bullet points.`;

// ─────────────────────────────────────────
// AI WORKER
// ─────────────────────────────────────────

class AIWorker {
	constructor(env) {
		this.anthropicKey = env.ANTHROPIC_API_KEY;
		this.supabaseUrl = env.SUPABASE_URL;
		this.supabaseKey = env.SUPABASE_SERVICE_KEY;
	}

	get db() {
		return { supabaseUrl: this.supabaseUrl, supabaseKey: this.supabaseKey };
	}

	// ── API Helpers ─────────────────────────

	async callClaude(userPrompt, maxTokens = SUMMARIZE_MAX_TOKENS, systemPrompt = null, thinking = THINKING_DISABLED) {
		const body = {
			model: CLAUDE_MODEL,
			max_tokens: maxTokens,
			thinking,
			messages: [{ role: 'user', content: userPrompt }]
		};
		if (systemPrompt) {
			// Static instructions go in system with a cache breakpoint; the
			// variable bill/member data stays in the user turn after it.
			body.system = [
				{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
			];
		}

		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.anthropicKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Claude API error ${res.status}: ${err}`);
		}
		const data = await res.json();
		return extractText(data);
	}

	async dbFetch(path, filter = '') {
		const res = await fetch(`${this.supabaseUrl}/rest/v1/${path}${filter ? '?' + filter : ''}`, {
			headers: {
				Authorization: `Bearer ${this.supabaseKey}`,
				apikey: this.supabaseKey
			}
		});
		if (!res.ok) throw new Error(`DB fetch error: ${path}`);
		return res.json();
	}

	async dbPatch(table, id, data) {
		const res = await fetch(`${this.supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.supabaseKey}`,
				apikey: this.supabaseKey,
				Prefer: 'return=minimal'
			},
			body: JSON.stringify(data)
		});
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Patch ${table} error: ${err}`);
		}
	}

	// ═══════════════════════════════════════════
	// 1. BILL SUMMARIZATION
	// ═══════════════════════════════════════════

	async fetchBillText(url) {
		if (!url) return null;
		try {
			const res = await fetch(url, {
				headers: { 'User-Agent': 'CanaryBlair/1.0 (civic accountability tool)' }
			});
			if (!res.ok) return null;
			const html = await res.text();

			let text = html
				.replace(/<script[\s\S]*?<\/script>/gi, '')
				.replace(/<style[\s\S]*?<\/style>/gi, '')
				.replace(/<[^>]+>/g, ' ')
				.replace(/&nbsp;/g, ' ')
				.replace(/&amp;/g, '&')
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&quot;/g, '"')
				.replace(/&#?\w+;/g, '')
				.replace(/\s+/g, ' ')
				.trim();

			// Bills put operative language throughout, and amendments at the end —
			// keep the head AND the tail rather than hard-truncating.
			if (text.length > 15000) {
				text =
					text.slice(0, 10000) +
					'\n\n[... middle of bill omitted — text exceeds 15,000 characters ...]\n\n' +
					text.slice(-5000);
			}

			return text.length > 100 ? text : null;
		} catch {
			return null;
		}
	}

	buildBillUserPrompt(bill, sponsors, billText) {
		const textSection = billText
			? `\nFull Bill Text:\n${billText}`
			: `\nDescription: ${bill.description || 'No description available.'}`;

		return `Here is a ${STATE_CONFIG.name} bill:

Bill Number: ${bill.bill_number}
Title: ${bill.title}
Status: ${bill.status_text}
Sponsors: ${sponsors.length ? sponsors.join(', ') : 'Unknown'}
${textSection}`.trim();
	}

	async summarizeBill(billId) {
		const [bill] = await this.dbFetch('bills', `select=id,bill_number,title,description,status_text,bill_text_url&id=eq.${billId}`);
		if (!bill) throw new Error(`Bill ${billId} not found`);

		// Get sponsor names
		const sponsors = await this.dbFetch(
			'bill_sponsors',
			`select=members(full_name)&bill_id=eq.${billId}`
		);
		const sponsorNames = sponsors.map((s) => s.members?.full_name).filter(Boolean);

		// Fetch full bill text from WV Legislature website
		const billText = await this.fetchBillText(bill.bill_text_url);

		const userPrompt = this.buildBillUserPrompt(bill, sponsorNames, billText);
		// Classification is the highest-stakes call — let the model reason first
		// (adaptive thinking) with a generous budget, since thinking tokens count
		// against max_tokens.
		const response = await this.callClaude(userPrompt, BILL_MAX_TOKENS, BILL_SYSTEM_PROMPT, THINKING_ADAPTIVE);

		let parsed;
		try {
			parsed = JSON.parse(response);
		} catch {
			const match = response.match(/\{[\s\S]*\}/);
			if (match) parsed = JSON.parse(match[0]);
			else throw new Error(`Could not parse AI response for bill ${billId}`);
		}

		const impactTier = parseInt(parsed.impact_tier);
		const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : null;
		// Arrays are sent as plain JSON — PostgREST converts them to text[]
		// safely, unlike hand-built `{a,b}` literals which break on commas/quotes.
		await this.dbPatch('bills', billId, {
			ai_summary: parsed.summary,
			ai_critical_points: parsed.critical_points || [],
			ai_who_benefits: parsed.who_benefits,
			ai_who_is_hurt: parsed.who_is_hurt,
			ai_reasoning: parsed.reasoning || null,
			ai_alignment: parsed.alignment || null,
			ai_impact_tier: impactTier >= 1 && impactTier <= 6 ? impactTier : 4,
			ai_confidence: confidence,
			ai_tags: parsed.tags || [],
			ai_summary_updated_at: new Date().toISOString(),
			ai_summary_text_url: bill.bill_text_url || null
		});
		if (confidence === 'low') {
			console.log(`   ⚠ low-confidence classification on ${bill.bill_number} — consider human review`);
		}

		console.log(`✅ Summarized bill ${bill.bill_number}: ${bill.title.slice(0, 60)}...`);
	}

	async summarizeBills(billIds) {
		const batch = billIds.slice(0, MAX_BILLS_PER_RUN);
		if (billIds.length > batch.length) {
			console.log(`⏳ ${billIds.length - batch.length} bills deferred — the daily sweep will pick them up`);
		}
		console.log(`🤖 Summarizing ${batch.length} bills...`);
		let success = 0,
			failed = 0;
		for (const id of batch) {
			try {
				await this.summarizeBill(id);
				success++;
				await new Promise((r) => setTimeout(r, 200));
			} catch (err) {
				failed++;
				console.error(`Failed to summarize bill ${id}:`, err.message);
			}
		}
		console.log(`📋 Summarization: ${success} success, ${failed} failed`);
		return success;
	}

	/**
	 * Retry sweep: summarize bills that still have no AI summary — bills
	 * deferred by the per-run cap, or whose summarization failed. Runs daily.
	 */
	async sweepUnsummarized(limit = MAX_BILLS_PER_RUN) {
		const bills = await this.dbFetch(
			'bills',
			`select=id&ai_summary=is.null&order=last_action_date.desc.nullslast&limit=${limit}`
		);
		if (!bills.length) {
			console.log('🧹 Sweep: no unsummarized bills');
			return 0;
		}
		console.log(`🧹 Sweep: ${bills.length} unsummarized bills found`);
		return this.summarizeBills(bills.map((b) => b.id));
	}

	// ═══════════════════════════════════════════
	// 2. CANARY SCORE CALCULATOR (shared engine)
	// ═══════════════════════════════════════════

	async calculateScores() {
		console.log('🐦 Canary Score calculation starting...');

		// Select override columns too — the engine uses effective (post-override)
		// values — plus ai_confidence (low-confidence calls are discounted).
		const bills = await fetchAllRows(this.db, 'bills?select=id,ai_tags,ai_alignment,ai_alignment_override,ai_impact_tier,ai_impact_tier_override,ai_confidence,status&ai_tags=not.is.null');
		const votes = await fetchAllRows(this.db, 'votes?select=member_id,vote_value,bill_id,roll_call_id');
		const members = await fetchAllRows(this.db, 'members?select=id,full_name,party,chamber');
		const sponsorships = await fetchAllRows(this.db, 'bill_sponsors?select=member_id,bill_id,sponsor_type');
		// Roll-call dates for dedupe; yea/nay for contested-vote weighting.
		const rollCalls = await fetchAllRows(this.db, 'roll_calls?select=id,date,yea,nay');

		console.log(`📊 ${bills.length} tagged bills, ${votes.length} votes, ${members.length} members`);

		const current = await this.currentSession();
		const prior = await this.priorSession();
		const priorScores = prior ? await fetchPriorScores(this.db, prior.id) : new Map();

		const results = scoreMembers({ bills, votes, members, sponsorships, priorScores, rollCalls });
		const written = await writeScores(this.db, results);
		if (current) await appendScoreHistory(this.db, results, current.id);

		console.log(`✅ Scores written for ${written} members; history snapshotted`);
	}

	// ═══════════════════════════════════════════
	// 3. MEMBER PROFILE GENERATION
	// ═══════════════════════════════════════════

	buildProfileUserPrompt(member, summary, sponsoredBills, keyVotes) {
		const chamber = member.chamber === 'H' ? 'House of Delegates' : 'Senate';
		const tierName = TIER_NAMES[member.canary_tier] || 'Unscored';
		const badges = (member.canary_badges || []).map((b) => BADGE_NAMES[b] || b).join(', ') || 'None';

		// Separate key votes into "helped score" and "hurt score"
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

		// Sponsored bills — separate by alignment
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

		const helpedSection = helpedScore.length > 0 ? helpedScore.slice(0, 15).join('\n') : 'None on record.';
		const hurtSection = hurtScore.length > 0 ? hurtScore.slice(0, 15).join('\n') : 'None on record.';
		const peopleSponsorSection = peopleSponsor.length > 0 ? peopleSponsor.slice(0, 10).join('\n') : 'None.';
		const capitalSponsorSection = capitalSponsor.length > 0 ? capitalSponsor.slice(0, 10).join('\n') : 'None.';

		return `LEGISLATOR:
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
${formatFinanceSection(member)}`.trim();
	}

	async generateMemberProfile(memberId) {
		// Fetch member data
		const [member] = await this.dbFetch('members',
			`select=id,full_name,party,chamber,district,canary_score,canary_tier,canary_badges,next_election,finance_total_raised,finance_cycle,finance_matched_by,finance_top_donors,finance_top_industries,finance_contrib_types,finance_small_donor_total&id=eq.${memberId}`
		);
		if (!member) throw new Error(`Member ${memberId} not found`);

		// Fetch vote summary
		const summaryArr = await this.dbFetch('member_vote_summary', `select=*&member_id=eq.${memberId}`);
		const summary = summaryArr[0] || null;

		// Fetch sponsored bills with alignment data
		const sponsored = await this.dbFetch('bill_sponsors',
			`select=sponsor_type,bills(bill_number,title,ai_alignment,ai_impact_tier)&member_id=eq.${memberId}&order=bill_id.desc&limit=30`
		);

		// Fetch votes on high-impact bills (tier 1-3), most recent first by the
		// actual roll call date — not created_at, which is DB insert time.
		const keyVotes = await this.dbFetch('votes',
			`select=vote_text,vote_value,roll_calls(date),bills(bill_number,title,ai_alignment,ai_impact_tier)&member_id=eq.${memberId}&order=roll_calls(date).desc.nullslast&limit=200`
		);
		const filteredKeyVotes = keyVotes.filter((v) =>
			v.bills && v.bills.bill_number && v.bills.ai_impact_tier && v.bills.ai_impact_tier <= 3
		);

		const userPrompt = this.buildProfileUserPrompt(member, summary, sponsored, filteredKeyVotes);
		const profile = await this.callClaude(userPrompt, PROFILE_MAX_TOKENS, PROFILE_SYSTEM_PROMPT);

		await this.dbPatch('members', memberId, {
			ai_profile_summary: profile.trim(),
			ai_profile_updated_at: new Date().toISOString()
		});

		console.log(`✅ Profile: ${member.full_name} (${member.party}) — ${member.canary_score || '?'}`);
	}

	async refreshAllMemberProfiles() {
		const members = await this.dbFetch('members', 'select=id,full_name&order=canary_score.desc.nullslast');
		console.log(`👥 Refreshing ${members.length} member profiles...`);
		let success = 0,
			failed = 0;
		for (const member of members) {
			try {
				await this.generateMemberProfile(member.id);
				success++;
				await new Promise((r) => setTimeout(r, 200));
			} catch (err) {
				failed++;
				console.error(`Failed profile for ${member.full_name}:`, err.message);
			}
		}
		console.log(`📋 Profiles: ${success} success, ${failed} failed`);
	}

	// ═══════════════════════════════════════════
	// 4. SESSION DIGESTS
	// ═══════════════════════════════════════════

	async generateDigest(periodType, sessionId) {
		const now = new Date();
		let periodStart, periodEnd;

		if (periodType === 'daily') {
			const yesterday = new Date(now);
			yesterday.setDate(yesterday.getDate() - 1);
			periodStart = periodEnd = yesterday.toISOString().slice(0, 10);
		} else if (periodType === 'weekly') {
			const end = new Date(now);
			const start = new Date(now);
			start.setDate(start.getDate() - 7);
			periodStart = start.toISOString().slice(0, 10);
			periodEnd = end.toISOString().slice(0, 10);
		} else if (periodType === 'monthly') {
			periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
			periodEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
		} else if (periodType === 'yearly') {
			periodStart = `${now.getFullYear() - 1}-01-01`;
			periodEnd = `${now.getFullYear() - 1}-12-31`;
		}

		const bills = await this.dbFetch(
			'bills',
			`select=id,bill_number,title,status_text&session_id=eq.${sessionId}&last_action_date=gte.${periodStart}&last_action_date=lte.${periodEnd}`
		);

		const passed = bills.filter((b) => b.status_text === 'Passed');
		const introduced = bills.filter((b) => b.status_text === 'Introduced');

		const rollCalls = await this.dbFetch(
			'roll_calls',
			`select=id&session_id=eq.${sessionId}&date=gte.${periodStart}&date=lte.${periodEnd}`
		);

		// Off-season: the legislature isn't sitting, so there's nothing to report.
		// Skip the digest (and the Claude call) rather than posting a hollow
		// "nothing happened this period" summary every day the session is dark.
		if (bills.length === 0 && rollCalls.length === 0) {
			console.log(`💤 No legislative activity for ${periodType} ${periodStart} — skipping digest`);
			return;
		}

		const prompt = `You are Canary Blair — a civic accountability tool for ${STATE_CONFIG.name} residents.
Write a ${periodType} digest of ${STATE_CONFIG.name} legislative activity.

Period covered: ${periodStart} to ${periodEnd}
Bills introduced: ${introduced.length}
Bills passed: ${passed.length}
Total votes taken: ${rollCalls.length}

Key bills this period:
${[...passed, ...introduced].slice(0, 10).map((b) =>
	`- ${b.bill_number}: "${b.title}" (${b.status_text})`
).join('\n') || 'None.'}

Write a clear, honest 3-6 sentence summary of what the legislature did this ${periodType}.
Highlight anything significant — major bills passed, controversial votes,
anything that affects everyday ${STATE_CONFIG.demonym}.
Write for a general audience. Be direct. Don't bury the lede.

Respond with plain text only.`.trim();

		const summary = await this.callClaude(prompt, DIGEST_MAX_TOKENS);

		await fetch(`${this.supabaseUrl}/rest/v1/session_digests`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.supabaseKey}`,
				apikey: this.supabaseKey,
				Prefer: 'resolution=merge-duplicates,return=minimal'
			},
			body: JSON.stringify({
				session_id: sessionId,
				period_type: periodType,
				period_start: periodStart,
				period_end: periodEnd,
				summary: summary.trim(),
				bills_covered: bills.map((b) => b.id).filter(Boolean)
			})
		});

		console.log(`✅ ${periodType} digest generated for ${periodStart}`);
	}

	async currentSession() {
		const [session] = await this.dbFetch('sessions', 'select=id,sine_die&prior=eq.false&order=year_start.desc&limit=1');
		return session || null;
	}

	async priorSession() {
		const [session] = await this.dbFetch('sessions', 'select=id&prior=eq.true&order=year_start.desc&limit=1');
		return session || null;
	}

	/**
	 * Once a session goes sine die (adjourned for good), stamp its latest
	 * history snapshot per member as the permanent public record. Idempotent —
	 * re-running just re-marks the same rows. We shall never forget.
	 */
	async finalizeAdjournedSessions() {
		const sessions = await this.dbFetch('sessions', 'select=id,name&sine_die=eq.true&prior=eq.false');
		for (const s of sessions) {
			try {
				await finalizeSession(this.db, s.id);
				console.log(`🔒 Finalized permanent scores for session ${s.id} (${s.name})`);
			} catch (err) {
				console.error(`Failed to finalize session ${s.id}:`, err.message);
			}
		}
	}
}

// Named export for local testing
export { AIWorker };

// ─────────────────────────────────────────
// CLOUDFLARE WORKER ENTRY POINT
// ─────────────────────────────────────────
export default {
	// HTTP trigger — called by sync worker after a sync run
	async fetch(request, env) {
		if (request.method !== 'POST') {
			return new Response('Canary Blair AI Worker', { status: 200 });
		}

		const worker = new AIWorker(env);
		const body = await request.json();

		try {
			// Task: summarize new/changed bills, then recalculate scores.
			// summarizeBills caps itself at MAX_BILLS_PER_RUN; the daily sweep
			// picks up any remainder.
			if (body.task === 'summarize' && body.bill_ids?.length) {
				const summarized = await worker.summarizeBills(body.bill_ids);
				if (summarized > 0) {
					console.log('🔄 Auto-running score calculation after summarization...');
					await worker.calculateScores();
				}
			}

			// Task: just recalculate scores (no AI calls)
			if (body.task === 'score') {
				await worker.calculateScores();
			}

			// Task: regenerate member profiles
			if (body.task === 'member_profiles') {
				await worker.refreshAllMemberProfiles();
			}

			// Task: generate digest
			if (body.task === 'digest') {
				await worker.generateDigest(body.period_type, body.session_id);
			}

			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'Content-Type': 'application/json' }
			});
		} catch (err) {
			return new Response(JSON.stringify({ error: err.message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	},

	// Scheduled cron jobs
	async scheduled(event, env) {
		const worker = new AIWorker(env);
		const cron = event.cron;

		// Daily — every day at 7am UTC: sweep unsummarized bills, then digest
		if (cron === '0 7 * * *') {
			const swept = await worker.sweepUnsummarized();
			if (swept > 0) await worker.calculateScores();
			const session = await worker.currentSession();
			if (session) await worker.generateDigest('daily', session.id);
		}

		// Weekly digest — every Monday at 7am UTC
		if (cron === '0 7 * * 1') {
			const session = await worker.currentSession();
			if (session) await worker.generateDigest('weekly', session.id);
		}

		// Monthly digest — 1st of the month at 7am UTC (covers previous month)
		if (cron === '0 7 1 * *') {
			const session = await worker.currentSession();
			if (session) await worker.generateDigest('monthly', session.id);
		}

		// Yearly digest — Jan 2 at 7am UTC (covers previous year)
		if (cron === '0 7 2 1 *') {
			const session = await worker.currentSession();
			if (session) await worker.generateDigest('yearly', session.id);
		}

		// Full refresh — every Sunday at 8am UTC
		// Recalculate all scores, regenerate profiles, then finalize any
		// session that has adjourned sine die into the permanent record.
		if (cron === '0 8 * * 0') {
			await worker.calculateScores();
			await worker.refreshAllMemberProfiles();
			await worker.finalizeAdjournedSessions();
		}
	}
};
