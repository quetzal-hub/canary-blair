import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { error } from '@sveltejs/kit';
import { effectiveAlignment, effectiveImpactTier, billWeight, votePoints, SPONSOR_WEIGHTS, contestednessFactor, billAdvanced, CHEAP_SPONSOR_WEIGHT, isProceduralMotion } from '$lib/utils.js';

const VOTES_PER_PAGE = 30;

// How many itemized rows to send to the client for the audit trail. We show the
// votes that moved the score most; the rest are folded into the totals.
const BREAKDOWN_LIMIT = 60;

const BILL_COLS = 'id, bill_number, title, status, status_text, ai_alignment, ai_alignment_override, ai_impact_tier, ai_impact_tier_override, ai_confidence';

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
			.select(`vote_value, roll_call_id, roll_calls(date, yea, nay, description), bills!inner(${BILL_COLS})`)
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
	// Same final-vote dedupe as the engine: one vote per bill — the member's
	// vote on the latest roll call (final passage supersedes amendment votes).
	const byBill = new Map();
	for (const v of scoredVotesRes.data || []) {
		if (!v.bills) continue;
		if (v.roll_calls && isProceduralMotion(v.roll_calls.description)) continue; // procedural motions aren't a position on the bill
		const key = v.bills.id;
		const prev = byBill.get(key);
		if (!prev) { byBill.set(key, v); continue; }
		const dPrev = prev.roll_calls?.date || '';
		const dCur = v.roll_calls?.date || '';
		if (dCur > dPrev || (dCur === dPrev && (v.roll_call_id || 0) >= (prev.roll_call_id || 0))) {
			byBill.set(key, v);
		}
	}
	const scoredVotes = [...byBill.values()];
	const items = [];
	const totals = { people_yea: 0, people_nay: 0, capital_yea: 0, capital_nay: 0, missed: 0, vote_points: 0, sponsor_points: 0 };

	for (const v of scoredVotes) {
		const bill = v.bills;
		const alignment = effectiveAlignment(bill);
		if (alignment !== 'for_people' && alignment !== 'for_capital') continue; // override may have neutralized it
		// Same weighting as the engine: impact × confidence × how contested the vote was.
		const cf = v.roll_calls ? contestednessFactor(v.roll_calls.yea, v.roll_calls.nay) : 1;
		const weight = billWeight(bill) * cf;
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
		// Cheap-virtue discount matches the engine: a cosponsor pile-on onto a
		// dead for_people bill counts a quarter; everything else full.
		const base = (SPONSOR_WEIGHTS[s.sponsor_type] || 1) * billWeight(bill);
		const cheapVirtue = s.sponsor_type !== 1 && alignment === 'for_people' && !billAdvanced(bill.status);
		const weight = cheapVirtue ? base * CHEAP_SPONSOR_WEIGHT : base;
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

	// ── Gatekeeper: what died in the committees this member CHAIRS ──
	// A chair controls their committee's agenda, so bills that die there without
	// a vote are attributable to them. Only runs for the ~46 chairs.
	const normCom = (s) => (s || '').replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim().toLowerCase();
	const { data: chairRoles } = await supabase
		.from('committee_memberships')
		.select('committee_name, chamber')
		.eq('member_id', id)
		.eq('role', 'chair');

	let gatekeeper = null;
	if (chairRoles && chairRoles.length) {
		const chairedKeys = new Set(chairRoles.map((c) => `${normCom(c.committee_name)}|${c.chamber}`));
		const chambers = [...new Set(chairRoles.map((c) => c.chamber))];
		const { data: hiBills } = await supabase
			.from('bills')
			.select('id, bill_number, title, ai_impact_tier, committee_name, chamber')
			.eq('ai_alignment', 'for_people')
			.in('ai_impact_tier', [1, 2])
			.in('chamber', chambers);
		const inMyCommittees = (hiBills || []).filter(
			(b) => b.committee_name && chairedKeys.has(`${normCom(b.committee_name)}|${b.chamber}`)
		);
		let votedSet = new Set();
		if (inMyCommittees.length) {
			const { data: rcs } = await supabase.from('roll_calls').select('bill_id').in('bill_id', inMyCommittees.map((b) => b.id));
			votedSet = new Set((rcs || []).map((r) => r.bill_id));
		}
		const buried = inMyCommittees
			.filter((b) => !votedSet.has(b.id))
			.sort((a, b) => a.ai_impact_tier - b.ai_impact_tier || a.bill_number.localeCompare(b.bill_number));
		gatekeeper = { committees: chairRoles.map((c) => c.committee_name), buried };
	}

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
		gatekeeper,
		scoreHistory: historyRes.error ? [] : (historyRes.data || [])
	};
}
