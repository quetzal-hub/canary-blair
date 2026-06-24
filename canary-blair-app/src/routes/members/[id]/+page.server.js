import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { error } from '@sveltejs/kit';

const VOTES_PER_PAGE = 30;

export async function load({ params, url }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const id = parseInt(params.id);
	const votePage = parseInt(url.searchParams.get('vp') || '1');
	const voteOffset = (votePage - 1) * VOTES_PER_PAGE;

	const [memberRes, summaryRes, sponsoredRes, votesRes, voteCountRes] = await Promise.all([
		supabase.from('members').select('*').eq('id', id).single(),
		supabase.from('member_vote_summary').select('*').eq('member_id', id).single(),
		supabase
			.from('bill_sponsors')
			.select('sponsor_type, bills(id, bill_number, title, status, status_text, ai_alignment, ai_impact_tier)')
			.eq('member_id', id)
			.order('bill_id', { ascending: false })
			.limit(20),
		supabase
			.from('votes')
			.select('vote_text, vote_value, created_at, bills(id, bill_number, title, status_text, ai_alignment, ai_impact_tier)')
			.eq('member_id', id)
			.order('created_at', { ascending: false })
			.range(voteOffset, voteOffset + VOTES_PER_PAGE - 1),
		supabase
			.from('votes')
			.select('id', { count: 'exact', head: true })
			.eq('member_id', id)
	]);

	if (!memberRes.data) {
		error(404, 'Member not found');
	}

	return {
		member: memberRes.data,
		summary: summaryRes.data || null,
		sponsored: sponsoredRes.data || [],
		votes: votesRes.data || [],
		voteTotalCount: voteCountRes.count || 0,
		votePage,
		voteTotalPages: Math.ceil((voteCountRes.count || 0) / VOTES_PER_PAGE)
	};
}
