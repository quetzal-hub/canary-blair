import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const id = parseInt(params.id);

	const [billRes, actionsRes, rollCallsRes] = await Promise.all([
		supabase
			.from('bills')
			.select(`*, bill_sponsors(sponsor_type, members(id, full_name, party))`)
			.eq('id', id)
			.single(),
		supabase.from('bill_actions').select('*').eq('bill_id', id).order('sequence'),
		supabase
			.from('roll_calls')
			.select(
				`*, votes(vote_value, vote_text, members(id, full_name, party, district, chamber))`
			)
			.eq('bill_id', id)
			.order('date', { ascending: false })
	]);

	if (!billRes.data) {
		error(404, 'Bill not found');
	}

	return {
		bill: billRes.data,
		actions: actionsRes.data || [],
		rollCalls: rollCallsRes.data || []
	};
}
