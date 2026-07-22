import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { error } from '@sveltejs/kit';

// How many itemized actions to send for the audit trail; the rest fold into totals.
const BREAKDOWN_LIMIT = 60;

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const { data: governor } = await supabase.from('officials').select('*').eq('slug', 'governor').single();
	if (!governor) error(404, 'Governor data not yet loaded');

	const breakdown = governor.score_breakdown || null;
	const items = breakdown?.items || [];

	return {
		governor,
		breakdown: breakdown
			? {
					items: items.slice(0, BREAKDOWN_LIMIT),
					itemsTruncated: Math.max(0, items.length - BREAKDOWN_LIMIT),
					totals: breakdown.totals || {}
				}
			: null
	};
}
