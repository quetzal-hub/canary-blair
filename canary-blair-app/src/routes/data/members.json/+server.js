import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { jsonHeaders } from '$lib/csv.js';
import { getTierData } from '$lib/utils.js';

// Open data: every legislator's Canary Score as JSON.
export async function GET() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const { data } = await supabase
		.from('members')
		.select('id, full_name, party, chamber, district, canary_score, canary_tier, canary_votes_scored, canary_badges, is_current, canary_score_updated_at')
		.order('canary_score', { ascending: false, nullsFirst: false });

	const members = (data || []).map((m) => ({
		...m,
		tier_name: getTierData(m.canary_tier)?.name || null
	}));

	const body = JSON.stringify(
		{
			source: 'Canary Blair',
			license: 'Data from LegiScan; scores CC0. See /about.',
			generated_at: new Date().toISOString(),
			count: members.length,
			members
		},
		null,
		2
	);

	return new Response(body, { headers: jsonHeaders });
}
