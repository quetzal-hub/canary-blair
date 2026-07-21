import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const billSelect = 'id, bill_number, title, status, status_text, ai_summary, ai_alignment, ai_impact_tier, ai_tags, introduced_date, last_action, last_action_date, status_date';

	// The current (non-prior) session drives both the status banner and
	// whether the impact-bills section shows "still pending" or "how it ended."
	const { data: sessions } = await supabase
		.from('sessions')
		.select('id, name, year_start, sine_die')
		.eq('prior', false)
		.order('year_start', { ascending: false })
		.limit(1);
	const currentSession = sessions?.[0] || null;
	const sessionActive = currentSession ? !currentSession.sine_die : false;

	let lastVoteDate = null;
	if (currentSession && !sessionActive) {
		const { data: rollCalls } = await supabase
			.from('roll_calls')
			.select('date')
			.eq('session_id', currentSession.id)
			.order('date', { ascending: false })
			.limit(1);
		lastVoteDate = rollCalls?.[0]?.date || null;
	}

	// While the session is active: highest-impact bills still pending a final
	// outcome ("Bills to Watch"). Once it's adjourned, the same shape of query
	// but without the active-only filter — every bill that mattered, resolved
	// or not ("Most Impactful Bills of the Session").
	const impactBillsQuery = (alignment) => {
		let q = supabase
			.from('bills')
			.select(billSelect)
			.eq('ai_alignment', alignment)
			.in('ai_impact_tier', [1, 2]);
		if (currentSession) q = q.eq('session_id', currentSession.id);
		if (sessionActive) q = q.in('status', [1, 2, 3]).eq('is_archived', false);
		return q.order('ai_impact_tier', { ascending: true }).order('status_date', { ascending: false }).limit(5);
	};

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
		// Highest-impact "for the people" bills — pending if session's active, resolved if not
		impactBillsQuery('for_people'),
		// Same, for "for capital" bills
		impactBillsQuery('for_capital')
	]);

	return {
		digest: digestRes.data?.[0] || null,
		billCount: billCountRes.count || 0,
		passedCount: passedCountRes.count || 0,
		voteCount: voteCountRes.count || 0,
		topMembers: topRes.data || [],
		bottomMembers: bottomRes.data || [],
		peopleBills: peopleBillsRes.data || [],
		capitalBills: capitalBillsRes.data || [],
		currentSession,
		sessionActive,
		lastVoteDate
	};
}
