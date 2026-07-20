import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { error } from '@sveltejs/kit';
import { effectiveAlignment, effectiveImpactTier, billWeight, votePoints, SPONSOR_WEIGHTS } from '$lib/utils.js';

const VOTES_PER_PAGE = 30;

// How many itemized rows to send to the client for the audit trail. We show the
// votes that moved the score most; the rest are folded into the totals.
const BREAKDOWN_LIMIT = 60;

const BILL_COLS = 'id, bill_number, title, status, status_text, ai_alignment, ai_alignment_override, ai_impact_tier, ai_impact_tier_override';

export async function load({ params, url }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const id = parseInt(params.id);
	const votePage = parseInt(url.searchParams.get('vp') || '1');
	const voteOffset = (votePage - 1) * VOTES_PER_PAGE;

	const [memberRes, summaryRes, sponsoredRes, votesRes, voteCountRes, scoredVotesRes, historyRes] = await Promise.all([
		supabase.from('members').select('*').eq('id', id).single(),
		supabase.from('member_vote_summary').select('*').eq('member_id', id).single(),
		supabase
			.from('bill_sponsors')
			.select(`sponsor_type, bills(${BILL_COLS})`)
			.eq('member_id', id)
			.order('bill_id', { ascending: false })
			.limit(20),
		supabase
			.from('votes')
			.select(`vote_text, vote_value, created_at, roll_calls(date), bills(${BILL_COLS})`)
			.eq('member_id', id)
			.order('roll_calls(date)', { ascending: false, nullsFirst: false })
			.range(voteOffset, voteOffset + VOTES_PER_PAGE - 1),
		supabase.from('votes').select('id', { count: 'exact', head: true }).eq('member_id', id),
		// Every vote on a bill the AI aligned as people/capital — the raw material
		// for the "how we got this number" audit trail. Inner join + filter keeps
		// it to scored bills only.
		supabase
			.from('votes')
			.select(`vote_value, bills!inner(${BILL_COLS})`)
			.eq('member_id', id)
			.in('bills.ai_alignment', ['for_people', 'for_capital']),
		// Permanent score history (schema/007). Table may not exist yet on older
		// deployments — handled below.
		supabase
			.from('member_score_history')
			.select('canary_score, canary_tier, votes_scored, is_final, snapshot_date, session_id')
			.eq('member_id', id)
			.order('snapshot_date', { ascending: true })
	]);

	if (!memberRes.data) {
		error(404, 'Member not found');
	}

	// ── Build the audit breakdown (mirrors the scoring engine) ──
	const scoredVotes = scoredVotesRes.data || [];
	const items = [];
	const totals = { people_yea: 0, people_nay: 0, capital_yea: 0, capital_nay: 0, missed: 0, vote_points: 0, sponsor_points: 0 };

	for (const v of scoredVotes) {
		const bill = v.bills;
		const alignment = effectiveAlignment(bill);
		if (alignment !== 'for_people' && alignment !== 'for_capital') continue; // override may have neutralized it
		const weight = billWeight(bill);
		const points = votePoints(alignment, v.vote_value, weight);
		totals.vote_points += points;
		if (v.vote_value === 3 || v.vote_value === 4) totals.missed++;
		else if (alignment === 'for_people') v.vote_value === 1 ? totals.people_yea++ : totals.people_nay++;
		else v.vote_value === 1 ? totals.capital_yea++ : totals.capital_nay++;
		items.push({
			bill_id: bill.id,
			bill_number: bill.bill_number,
			title: bill.title,
			alignment,
			impact_tier: effectiveImpactTier(bill),
			vote_value: v.vote_value,
			points: Math.round(points * 100) / 100
		});
	}

	// Sponsorship contributions (mirrors engine sponsorship scoring).
	const sponsorItems = [];
	for (const s of sponsoredRes.data || []) {
		const bill = s.bills;
		if (!bill) continue;
		const alignment = effectiveAlignment(bill);
		if (alignment !== 'for_people' && alignment !== 'for_capital') continue;
		const weight = (SPONSOR_WEIGHTS[s.sponsor_type] || 1) * billWeight(bill);
		const points = alignment === 'for_people' ? weight : -weight;
		totals.sponsor_points += points;
		sponsorItems.push({
			bill_id: bill.id,
			bill_number: bill.bill_number,
			title: bill.title,
			alignment,
			sponsor_type: s.sponsor_type,
			points: Math.round(points * 100) / 100
		});
	}

	totals.vote_points = Math.round(totals.vote_points * 100) / 100;
	totals.sponsor_points = Math.round(totals.sponsor_points * 100) / 100;
	totals.scored_votes = items.length;

	items.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
	sponsorItems.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

	// Did a human review any of the bills feeding this score? (drives the note)
	const anyReviewed =
		(scoredVotes.some((v) => v.bills?.ai_alignment_override != null || v.bills?.ai_impact_tier_override != null)) ||
		(sponsoredRes.data || []).some((s) => s.bills?.ai_alignment_override != null || s.bills?.ai_impact_tier_override != null);

	return {
		member: memberRes.data,
		summary: summaryRes.data || null,
		sponsored: sponsoredRes.data || [],
		votes: votesRes.data || [],
		voteTotalCount: voteCountRes.count || 0,
		votePage,
		voteTotalPages: Math.ceil((voteCountRes.count || 0) / VOTES_PER_PAGE),
		breakdown: {
			items: items.slice(0, BREAKDOWN_LIMIT),
			itemsTruncated: Math.max(0, items.length - BREAKDOWN_LIMIT),
			sponsorItems,
			totals,
			anyReviewed
		},
		scoreHistory: historyRes.error ? [] : (historyRes.data || [])
	};
}
