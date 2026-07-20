import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const billSelect = 'id, bill_number, title, status, status_text, ai_summary, ai_alignment, ai_impact_tier, ai_tags, introduced_date, last_action, last_action_date, status_date';

	const [digestRes, billCountRes, passedCountRes, voteCountRes, topRes, bottomRes, peopleBillsRes, capitalBillsRes] = await Promise.all([
		supabase
			.from('session_digests')
			.select('*')
			.order('period_start', { ascending: false })
			.in('period_type', ['daily', 'weekly'])
			.limit(1),
		supabase.from('bills').select('id', { count: 'exact', head: true }),
		supabase.from('bills').select('id', { count: 'exact', head: true }).eq('status', 4),
		supabase.from('votes').select('id', { count: 'exact', head: true }),
		// Top 3 Canary Scores
		supabase
			.from('members')
			.select('id, full_name, party, chamber, district, photo_url, canary_score, canary_tier, canary_votes_scored, canary_badges')
			.not('canary_score', 'is', null)
			.order('canary_score', { ascending: false })
			.limit(3),
		// Bottom 3 Canary Scores
		supabase
			.from('members')
			.select('id, full_name, party, chamber, district, photo_url, canary_score, canary_tier, canary_votes_scored, canary_badges')
			.not('canary_score', 'is', null)
			.order('canary_score', { ascending: true })
			.limit(3),
		// Top active For People bills (Landmark first, then High Impact, by recency)
		supabase
			.from('bills')
			.select(billSelect)
			.eq('ai_alignment', 'for_people')
			.in('ai_impact_tier', [1, 2])
			.in('status', [1, 2, 3])
			.eq('is_archived', false)
			.order('ai_impact_tier', { ascending: true })
			.order('status_date', { ascending: false })
			.limit(5),
		// Top active For Capital bills
		supabase
			.from('bills')
			.select(billSelect)
			.eq('ai_alignment', 'for_capital')
			.in('ai_impact_tier', [1, 2])
			.in('status', [1, 2, 3])
			.eq('is_archived', false)
			.order('ai_impact_tier', { ascending: true })
			.order('status_date', { ascending: false })
			.limit(5)
	]);

	return {
		digest: digestRes.data?.[0] || null,
		billCount: billCountRes.count || 0,
		passedCount: passedCountRes.count || 0,
		voteCount: voteCountRes.count || 0,
		topMembers: topRes.data || [],
		bottomMembers: bottomRes.data || [],
		peopleBills: peopleBillsRes.data || [],
		capitalBills: capitalBillsRes.data || []
	};
}
