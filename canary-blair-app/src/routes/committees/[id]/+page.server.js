import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const id = parseInt(params.id);

	const [{ data: committee }, { data: bills }] = await Promise.all([
		supabase.from('committees').select('*').eq('id', id).single(),
		supabase
			.from('bills')
			.select('id, bill_number, title, status, status_text, introduced_date, last_action, last_action_date, ai_summary, ai_tags, ai_alignment, ai_impact_tier')
			.eq('committee_id', id)
			.order('last_action_date', { ascending: false, nullsFirst: false })
	]);

	if (!committee) error(404, 'Committee not found');

	const all = bills || [];
	const died = all.filter((b) => b.status === 6).length;

	return { committee, bills: all, died };
}
