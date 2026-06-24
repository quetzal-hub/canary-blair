import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export async function load({ url }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const chamber = url.searchParams.get('chamber') || 'all';
	const party = url.searchParams.get('party') || 'all';
	const search = url.searchParams.get('q') || '';
	const sort = url.searchParams.get('sort') || 'score';
	const tier = url.searchParams.get('tier') || 'all';

	let query = supabase
		.from('members')
		.select('id, full_name, party, chamber, district, photo_url, canary_score, canary_tier, canary_badges, canary_votes_scored, next_election');

	if (chamber !== 'all') {
		query = query.eq('chamber', chamber);
	}

	if (party !== 'all') {
		query = query.eq('party', party);
	}

	if (tier !== 'all') {
		query = query.eq('canary_tier', parseInt(tier));
	}

	if (search) {
		query = query.or(`full_name.ilike.%${search}%,district.ilike.%${search}%`);
	}

	if (sort === 'score') {
		query = query.order('canary_score', { ascending: false, nullsFirst: false });
	} else if (sort === 'score-asc') {
		query = query.order('canary_score', { ascending: true, nullsFirst: false });
	} else {
		query = query.order('full_name');
	}

	const { data: members } = await query;

	return {
		members: members || [],
		filters: { chamber, party, search, sort, tier }
	};
}
