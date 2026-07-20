import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { toCsv, csvHeaders } from '$lib/csv.js';
import { getTierData } from '$lib/utils.js';

// Open data: every legislator's Canary Score as CSV. Journalists and
// researchers can pull the whole scoreboard with one request.
export async function GET() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const { data } = await supabase
		.from('members')
		.select('id, full_name, party, chamber, district, canary_score, canary_tier, canary_votes_scored, canary_badges, is_current')
		.order('canary_score', { ascending: false, nullsFirst: false });

	const rows = (data || []).map((m) => ({
		...m,
		chamber: m.chamber === 'H' ? 'House' : m.chamber === 'S' ? 'Senate' : m.chamber,
		canary_tier_name: getTierData(m.canary_tier)?.name || 'Unscored',
		canary_badges: m.canary_badges || []
	}));

	const csv = toCsv(rows, [
		{ key: 'id', label: 'member_id' },
		{ key: 'full_name', label: 'name' },
		{ key: 'party' },
		{ key: 'chamber' },
		{ key: 'district' },
		{ key: 'canary_score' },
		{ key: 'canary_tier', label: 'tier_number' },
		{ key: 'canary_tier_name', label: 'tier_name' },
		{ key: 'canary_votes_scored', label: 'scored_votes' },
		{ key: 'canary_badges', label: 'badges' },
		{ key: 'is_current', label: 'sitting' }
	]);

	return new Response(csv, { headers: csvHeaders('canary-blair-members.csv') });
}
