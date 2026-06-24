/**
 * CANARY BLAIR — AI Pipeline Worker
 *
 * Runs as a Cloudflare Worker. Handles:
 *   1. Bill summarization (alignment, impact tier, critical points, tags)
 *   2. Canary Score calculation (weighted by bill impact + sponsorship)
 *   3. Member profile generation (AI summaries of voting patterns)
 *   4. Session digest generation (daily, weekly, monthly, yearly)
 *
 * Triggered by:
 *   - HTTP POST from sync worker (after new/changed bills detected)
 *   - Cron schedule (digests, weekly profile + score refresh)
 */

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const SUMMARIZE_MAX_TOKENS = 1000;
const PROFILE_MAX_TOKENS = 1500;
const DIGEST_MAX_TOKENS = 1000;

// ─────────────────────────────────────────
// SCORING CONFIG (matches pipeline/score.js)
// ─────────────────────────────────────────

const TIER_WEIGHTS = {
  1: 5,      // Landmark
  2: 3,      // High Impact
  3: 2,      // Meaningful
  4: 1,      // Routine
  5: 0.5,    // Minor
  6: 0.25    // Ceremonial
};

const SPONSOR_WEIGHTS = {
  1: 3,    // Primary sponsor
  2: 1.5   // Cosponsor
};

const TIER_THRESHOLDS = [
  { min: 80, tier: 1, name: 'Mountaineer' },
  { min: 60, tier: 2, name: 'Friend of the Holler' },
  { min: 45, tier: 3, name: 'Weathervane' },
  { min: 35, tier: 4, name: 'Company Man' },
  { min: 20, tier: 5, name: 'Rat in the Capitol' },
  { min: 0,  tier: 6, name: 'Owned' }
];

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

const MIN_SCORED_VOTES = 20;

function getBillWeight(bill) {
  const tier = bill.ai_impact_tier;
  if (tier && TIER_WEIGHTS[tier] !== undefined) return TIER_WEIGHTS[tier];
  return 1;
}

function getTier(score) {
  for (const t of TIER_THRESHOLDS) {
    if (score >= t.min) return t;
  }
  return TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
}

// ─────────────────────────────────────────
// AI WORKER
// ─────────────────────────────────────────

class AIWorker {
  constructor(env) {
    this.anthropicKey = env.ANTHROPIC_API_KEY;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_SERVICE_KEY;
  }

  // ── API Helpers ─────────────────────────

  async callClaude(prompt, maxTokens = SUMMARIZE_MAX_TOKENS) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.content[0].text;
  }

  async dbFetch(path, filter = '') {
    const res = await fetch(`${this.supabaseUrl}/rest/v1/${path}${filter ? '?' + filter : ''}`, {
      headers: {
        'Authorization': `Bearer ${this.supabaseKey}`,
        'apikey': this.supabaseKey,
      },
    });
    if (!res.ok) throw new Error(`DB fetch error: ${path}`);
    return res.json();
  }

  async dbFetchAll(path, filter = '') {
    const rows = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const sep = filter ? '&' : '';
      const batch = await this.dbFetch(path, `${filter}${sep}offset=${offset}&limit=${pageSize}`);
      rows.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }
    return rows;
  }

  async dbPatch(table, id, data) {
    const res = await fetch(`${this.supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.supabaseKey}`,
        'apikey': this.supabaseKey,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Patch ${table} error: ${err}`);
    }
  }

  // ═══════════════════════════════════════════
  // 1. BILL SUMMARIZATION
  //    Matches pipeline/summarize.js prompts
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

      if (text.length > 15000) {
        text = text.slice(0, 15000) + '\n\n[Text truncated — bill exceeds 15,000 characters]';
      }

      return text.length > 100 ? text : null;
    } catch {
      return null;
    }
  }

  buildBillPrompt(bill, sponsors, billText) {
    const textSection = billText
      ? `\nFull Bill Text:\n${billText}`
      : `\nDescription: ${bill.description || 'No description available.'}`;

    return `You are Canary Blair — a civic accountability tool for West Virginia residents.
Your job is to translate government legislation into plain, honest language that any
West Virginia resident can understand, regardless of education level.

Be direct. Be clear. Be unflinching. Don't soften corporate or political interests.
Don't editorialize — just explain what is actually happening.

IMPORTANT: When analyzing who is hurt, consider ALL impacts — environmental damage,
reduced oversight, weakened protections, lost public input, health risks, pollution,
water contamination, worker safety, etc. A bill that reduces environmental regulation
HURTS the environment and the people who depend on clean air and water — say so clearly.
Do not bury environmental or public health harms in vague language.

Here is a West Virginia bill:

Bill Number: ${bill.bill_number}
Title: ${bill.title}
Status: ${bill.status_text}
Sponsors: ${sponsors.length ? sponsors.join(', ') : 'Unknown'}
${textSection}

Respond ONLY with a JSON object. No preamble, no markdown fences.
{
  "summary": "2-4 sentence plain language explanation of what this bill does. Write for a 10th grade reading level. Be concrete and specific.",
  "critical_points": ["Array of up to 10 bullet points highlighting key provisions, dollar amounts, deadlines, thresholds, exemptions, and other concrete details from the bill. Each bullet should be one clear sentence. For short bills, fewer points are fine — aim for 10 on longer bills."],
  "who_benefits": "1-3 sentences. Who gains from this bill passing? Be specific — name industries, groups, or interests when relevant.",
  "who_is_hurt": "1-3 sentences. Who loses or bears costs if this passes? Consider environmental harm, reduced oversight, public health risks, lost worker protections, and community impacts. If no one is clearly hurt, say so honestly.",
  "alignment": "One of: 'for_people' (primarily benefits ordinary WV residents, workers, communities, environment, public health), 'for_capital' (primarily benefits corporations, extractive industries, developers, or reduces protections for people/environment), or 'neutral' (purely procedural, administrative, or genuinely balanced). A bill that WEAKENS environmental or worker protections is 'for_capital' even if it is tagged with environment or worker topics.",
  "impact_tier": "Integer 1-6 rating how consequential this bill is. This is INDEPENDENT of alignment — it measures magnitude of real-world impact, not direction. 1 = LANDMARK: Transformative structural change affecting thousands of WV residents (e.g. gutting clean water protections statewide, major healthcare expansion, sweeping education overhaul). 2 = HIGH IMPACT: Significant real-world consequences for communities, health, environment, or livelihoods (e.g. weakening mine safety rules, expanding Medicaid eligibility, major tax shifts). 3 = MEANINGFUL: Clear benefit or harm but narrower scope — affects a specific group, region, or sector (e.g. teacher pay raise, single-industry regulation change). 4 = ROUTINE: Standard legislation with modest impact (e.g. updating licensing requirements, adjusting administrative procedures). 5 = MINOR: Small procedural tweaks, technical amendments, or housekeeping changes. 6 = CEREMONIAL: Resolutions, namings, commemorations, symbolic acts with no policy impact. Be honest — most bills are tier 3-5. Reserve tier 1 for bills that would fundamentally change how West Virginia works. A bill that touches water, environment, or public health in a state with known contamination problems should be weighted MORE seriously.",
  "tags": ["array", "of", "topic", "tags"]
}

Available tags (use only relevant ones, can add your own):
water, education, healthcare, environment, coal, energy, corporations, taxes, workers,
public-safety, guns, religion, voting-rights, housing, infrastructure, agriculture,
local-government, budget, criminal-justice, civil-rights, family, children, elderly`.trim();
  }

  async summarizeBill(billId) {
    const [bill] = await this.dbFetch('bills', `select=id,bill_number,title,description,status_text,bill_text_url&id=eq.${billId}`);
    if (!bill) throw new Error(`Bill ${billId} not found`);

    // Get sponsor names
    const sponsors = await this.dbFetch(
      'bill_sponsors',
      `select=members(full_name)&bill_id=eq.${billId}`
    );
    const sponsorNames = sponsors.map(s => s.members?.full_name).filter(Boolean);

    // Fetch full bill text from WV Legislature website
    const billText = await this.fetchBillText(bill.bill_text_url);

    const prompt = this.buildBillPrompt(bill, sponsorNames, billText);
    const response = await this.callClaude(prompt);

    let parsed;
    try {
      parsed = JSON.parse(response);
    } catch {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error(`Could not parse AI response for bill ${billId}`);
    }

    const impactTier = parseInt(parsed.impact_tier);
    await this.dbPatch('bills', billId, {
      ai_summary: parsed.summary,
      ai_critical_points: `{${(parsed.critical_points || []).map(p => '"' + p.replace(/"/g, '\\"') + '"').join(',')}}`,
      ai_who_benefits: parsed.who_benefits,
      ai_who_is_hurt: parsed.who_is_hurt,
      ai_alignment: parsed.alignment || null,
      ai_impact_tier: (impactTier >= 1 && impactTier <= 6) ? impactTier : 4,
      ai_tags: `{${(parsed.tags || []).join(',')}}`,
      ai_summary_updated_at: new Date().toISOString(),
      ai_summary_text_url: bill.bill_text_url || null,
    });

    console.log(`✅ Summarized bill ${bill.bill_number}: ${bill.title.slice(0, 60)}...`);
  }

  async summarizeBills(billIds) {
    console.log(`🤖 Summarizing ${billIds.length} bills...`);
    let success = 0, failed = 0;
    for (const id of billIds) {
      try {
        await this.summarizeBill(id);
        success++;
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        failed++;
        console.error(`Failed to summarize bill ${id}:`, err.message);
      }
    }
    console.log(`📋 Summarization: ${success} success, ${failed} failed`);
  }

  // ═══════════════════════════════════════════
  // 2. CANARY SCORE CALCULATOR
  //    Matches pipeline/score.js logic
  // ═══════════════════════════════════════════

  async calculateScores() {
    console.log('🐦 Canary Score calculation starting...');

    // Load bills with alignment and impact tier
    const bills = await this.dbFetchAll('bills', 'select=id,ai_tags,ai_alignment,ai_impact_tier&ai_tags=not.is.null');

    const billMap = new Map();
    for (const bill of bills) {
      const alignment = bill.ai_alignment;
      if (!alignment || alignment === 'neutral') continue;
      billMap.set(bill.id, {
        forPeople: alignment === 'for_people',
        forCapital: alignment === 'for_capital',
        weight: getBillWeight(bill),
        tags: bill.ai_tags,
        ai_impact_tier: bill.ai_impact_tier
      });
    }

    // Load all votes, members, sponsorships
    const votes = await this.dbFetchAll('votes', 'select=member_id,vote_value,bill_id,roll_call_id');
    const members = await this.dbFetchAll('members', 'select=id,full_name,party,chamber');
    const sponsorships = await this.dbFetchAll('bill_sponsors', 'select=member_id,bill_id,sponsor_type');

    console.log(`📊 ${bills.length} tagged bills, ${votes.length} votes, ${members.length} members`);

    // Group sponsorships by member
    const memberSponsorships = new Map();
    for (const s of sponsorships) {
      if (!memberSponsorships.has(s.member_id)) memberSponsorships.set(s.member_id, []);
      memberSponsorships.get(s.member_id).push(s);
    }

    // Build party-majority map for badge calculation
    const memberParty = new Map();
    for (const m of members) {
      memberParty.set(m.id, m.party);
    }

    const rollCallPartyVotes = new Map();
    for (const v of votes) {
      const party = memberParty.get(v.member_id);
      if (!party || !v.roll_call_id) continue;
      if (!rollCallPartyVotes.has(v.roll_call_id)) {
        rollCallPartyVotes.set(v.roll_call_id, { R: { yea: 0, nay: 0 }, D: { yea: 0, nay: 0 } });
      }
      const rc = rollCallPartyVotes.get(v.roll_call_id);
      if (rc[party]) {
        if (v.vote_value === 1) rc[party].yea++;
        else if (v.vote_value === 2) rc[party].nay++;
      }
    }

    // Group votes by member
    const memberVotes = new Map();
    for (const v of votes) {
      if (!memberVotes.has(v.member_id)) memberVotes.set(v.member_id, []);
      memberVotes.get(v.member_id).push(v);
    }

    // Score each member
    let written = 0;
    for (const member of members) {
      const myVotes = memberVotes.get(member.id) || [];

      let rawScore = 0;
      let maxPossibleScore = 0;
      let scoredVoteCount = 0;
      let forCapitalYeaTotal = 0, forCapitalVoteTotal = 0;
      let totalScoredRollCalls = 0, partyAlignCount = 0, crossPartyPeopleCount = 0;
      let totalVotesAll = myVotes.length;
      let nvAbsentAll = myVotes.filter(v => v.vote_value === 3 || v.vote_value === 4).length;

      for (const v of myVotes) {
        const bill = billMap.get(v.bill_id);
        if (!bill) continue;

        scoredVoteCount++;
        const w = bill.weight;
        maxPossibleScore += w;

        if (bill.forPeople) {
          if (v.vote_value === 1) rawScore += w;
          else if (v.vote_value === 2) rawScore -= w;
          else rawScore -= w * 0.25;
        }

        if (bill.forCapital) {
          if (v.vote_value === 1) { rawScore -= w; forCapitalYeaTotal++; forCapitalVoteTotal++; }
          else if (v.vote_value === 2) { rawScore += w; forCapitalVoteTotal++; }
          else { rawScore -= w * 0.25; forCapitalVoteTotal++; }
        }

        if (v.roll_call_id && member.party && (v.vote_value === 1 || v.vote_value === 2)) {
          totalScoredRollCalls++;
          const rc = rollCallPartyVotes.get(v.roll_call_id);
          if (rc && rc[member.party]) {
            const partyMajority = rc[member.party].yea > rc[member.party].nay ? 1 : 2;
            if (v.vote_value === partyMajority) partyAlignCount++;
            if (bill.forPeople && v.vote_value === 1 && partyMajority === 2) {
              crossPartyPeopleCount++;
            }
          }
        }
      }

      // Water/env and worker badge tracking (weighted)
      let waterPeopleYeaW = 0, waterPeopleTotalW = 0, waterPeopleCount = 0;
      let waterCapitalYeaW = 0, waterCapitalTotalW = 0, waterCapitalCount = 0;
      let workerPeopleYeaW = 0, workerPeopleTotalW = 0, workerPeopleCount = 0;
      let workerCapitalYeaW = 0, workerCapitalTotalW = 0, workerCapitalCount = 0;

      for (const v of myVotes) {
        const billData = billMap.get(v.bill_id);
        if (!billData?.tags) continue;
        const tags = billData.tags;
        const isWaterEnv = tags.includes('water') || tags.includes('environment');
        const isWorker = tags.includes('workers');
        const bw = billData.weight;

        if (billData.forPeople) {
          if (isWaterEnv) { waterPeopleCount++; waterPeopleTotalW += bw; if (v.vote_value === 1) waterPeopleYeaW += bw; }
          if (isWorker) { workerPeopleCount++; workerPeopleTotalW += bw; if (v.vote_value === 1) workerPeopleYeaW += bw; }
        } else if (billData.forCapital) {
          if (isWaterEnv) { waterCapitalCount++; waterCapitalTotalW += bw; if (v.vote_value === 1) waterCapitalYeaW += bw; }
          if (isWorker) { workerCapitalCount++; workerCapitalTotalW += bw; if (v.vote_value === 1) workerCapitalYeaW += bw; }
        }
      }

      const waterPeopleRate = waterPeopleCount >= 5 ? waterPeopleYeaW / waterPeopleTotalW : 0;
      const waterCapitalRate = waterCapitalCount >= 5 ? waterCapitalYeaW / waterCapitalTotalW : 1;
      const workerPeopleRate = workerPeopleCount >= 5 ? workerPeopleYeaW / workerPeopleTotalW : 0;
      const workerCapitalRate = workerCapitalCount >= 5 ? workerCapitalYeaW / workerCapitalTotalW : 1;

      // Sponsorship scoring
      const mySponsorships = memberSponsorships.get(member.id) || [];
      let sponsorScore = 0;
      let maxSponsorScore = 0;

      for (const s of mySponsorships) {
        const bill = billMap.get(s.bill_id);
        if (!bill) continue;
        const sponsorW = SPONSOR_WEIGHTS[s.sponsor_type] || 1;
        const tierW = bill.weight;
        const w = sponsorW * tierW;
        maxSponsorScore += w;
        if (bill.forPeople) sponsorScore += w;
        else if (bill.forCapital) sponsorScore -= w;
      }

      // Calculate combined score
      let canaryScore = null;
      let canaryTier = null;
      const totalMax = maxPossibleScore + maxSponsorScore;
      const totalRaw = rawScore + sponsorScore;

      if (scoredVoteCount >= MIN_SCORED_VOTES && totalMax > 0) {
        canaryScore = Math.round(((totalRaw + totalMax) / (2 * totalMax)) * 100);
        canaryScore = Math.min(100, Math.max(0, canaryScore));
        canaryTier = getTier(canaryScore).tier;
      }

      // Badges
      const badges = [];
      if (crossPartyPeopleCount >= 3) badges.push('lone-canary');
      if (totalVotesAll > 0 && (nvAbsentAll / totalVotesAll) > 0.25) badges.push('ghost');
      if (forCapitalVoteTotal > 0 && (forCapitalYeaTotal / forCapitalVoteTotal) >= 0.9) badges.push('corporate-friend');
      if (totalScoredRollCalls > 0 && (partyAlignCount / totalScoredRollCalls) >= 0.95) badges.push('lockstep');
      if (waterPeopleRate >= 0.8 && waterCapitalRate <= 0.5 && waterPeopleCount >= 5) badges.push('water-protector');
      if (workerPeopleRate >= 0.8 && workerCapitalRate <= 0.5 && workerPeopleCount >= 5) badges.push('friend-of-worker');

      await this.dbPatch('members', member.id, {
        canary_score: canaryScore,
        canary_tier: canaryTier,
        canary_badges: `{${badges.join(',')}}`,
        canary_votes_scored: scoredVoteCount,
        canary_score_updated_at: new Date().toISOString()
      });
      written++;
    }

    console.log(`✅ Scores written for ${written} members`);
  }

  // ═══════════════════════════════════════════
  // 3. MEMBER PROFILE GENERATION
  //    Matches pipeline/profiles.js prompt
  // ═══════════════════════════════════════════

  buildProfilePrompt(member, summary, sponsoredBills, keyVotes) {
    const chamber = member.chamber === 'H' ? 'House of Delegates' : 'Senate';
    const tierName = TIER_NAMES[member.canary_tier] || 'Unscored';
    const badges = (member.canary_badges || []).map(b => BADGE_NAMES[b] || b).join(', ') || 'None';

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

  async generateMemberProfile(memberId) {
    // Fetch member data
    const [member] = await this.dbFetch('members',
      `select=id,full_name,party,chamber,district,canary_score,canary_tier,canary_badges,next_election&id=eq.${memberId}`
    );
    if (!member) throw new Error(`Member ${memberId} not found`);

    // Fetch vote summary
    const summaryArr = await this.dbFetch('member_vote_summary',
      `select=*&member_id=eq.${memberId}`
    );
    const summary = summaryArr[0] || null;

    // Fetch sponsored bills with alignment data
    const sponsored = await this.dbFetch('bill_sponsors',
      `select=sponsor_type,bills(bill_number,title,ai_alignment,ai_impact_tier)&member_id=eq.${memberId}&order=bill_id.desc&limit=30`
    );

    // Fetch votes on high-impact bills (tier 1-3)
    const keyVotes = await this.dbFetch('votes',
      `select=vote_text,vote_value,bills(bill_number,title,ai_alignment,ai_impact_tier)&member_id=eq.${memberId}&order=created_at.desc&limit=200`
    );
    const filteredKeyVotes = keyVotes.filter(v =>
      v.bills && v.bills.bill_number && v.bills.ai_impact_tier && v.bills.ai_impact_tier <= 3
    );

    const prompt = this.buildProfilePrompt(member, summary, sponsored, filteredKeyVotes);
    const profile = await this.callClaude(prompt, PROFILE_MAX_TOKENS);

    await this.dbPatch('members', memberId, {
      ai_profile_summary: profile.trim(),
      ai_profile_updated_at: new Date().toISOString(),
    });

    console.log(`✅ Profile: ${member.full_name} (${member.party}) — ${member.canary_score || '?'}`);
  }

  async refreshAllMemberProfiles() {
    const members = await this.dbFetch('members', 'select=id,full_name&order=canary_score.desc.nullslast');
    console.log(`👥 Refreshing ${members.length} member profiles...`);
    let success = 0, failed = 0;
    for (const member of members) {
      try {
        await this.generateMemberProfile(member.id);
        success++;
        await new Promise(r => setTimeout(r, 200));
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

    const passed = bills.filter(b => b.status_text === 'Passed');
    const introduced = bills.filter(b => b.status_text === 'Introduced');

    const rollCalls = await this.dbFetch(
      'roll_calls',
      `select=id&session_id=eq.${sessionId}&date=gte.${periodStart}&date=lte.${periodEnd}`
    );

    const prompt = `You are Canary Blair — a civic accountability tool for West Virginia residents.
Write a ${periodType} digest of West Virginia legislative activity.

Period covered: ${periodStart} to ${periodEnd}
Bills introduced: ${introduced.length}
Bills passed: ${passed.length}
Total votes taken: ${rollCalls.length}

Key bills this period:
${[...passed, ...introduced].slice(0, 10).map(b =>
  `- ${b.bill_number}: "${b.title}" (${b.status_text})`
).join('\n') || 'None.'}

Write a clear, honest 3-6 sentence summary of what the legislature did this ${periodType}.
Highlight anything significant — major bills passed, controversial votes,
anything that affects everyday West Virginians.
Write for a general audience. Be direct. Don't bury the lede.

Respond with plain text only.`.trim();

    const summary = await this.callClaude(prompt, DIGEST_MAX_TOKENS);

    await fetch(`${this.supabaseUrl}/rest/v1/session_digests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.supabaseKey}`,
        'apikey': this.supabaseKey,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        session_id: sessionId,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        summary: summary.trim(),
        bills_covered: bills.map(b => b.id).filter(Boolean),
      }),
    });

    console.log(`✅ ${periodType} digest generated for ${periodStart}`);
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
      // Task: summarize new/changed bills, then recalculate scores
      if (body.task === 'summarize' && body.bill_ids?.length) {
        await worker.summarizeBills(body.bill_ids);
        // Auto-run scoring after summarization so scores reflect new data
        console.log('🔄 Auto-running score calculation after summarization...');
        await worker.calculateScores();
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
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  // Scheduled cron jobs
  async scheduled(event, env) {
    const worker = new AIWorker(env);
    const cron = event.cron;

    // Daily digest — every day at 7am UTC
    if (cron === '0 7 * * *') {
      const [session] = await worker.dbFetch('sessions', 'select=id&prior=eq.false&order=year_start.desc&limit=1');
      if (session) await worker.generateDigest('daily', session.id);
    }

    // Weekly digest — every Monday at 7am UTC
    if (cron === '0 7 * * 1') {
      const [session] = await worker.dbFetch('sessions', 'select=id&prior=eq.false&order=year_start.desc&limit=1');
      if (session) await worker.generateDigest('weekly', session.id);
    }

    // Full refresh — every Sunday at 8am UTC
    // Recalculate all scores, then regenerate all member profiles
    if (cron === '0 8 * * 0') {
      await worker.calculateScores();
      await worker.refreshAllMemberProfiles();
    }
  },
};
