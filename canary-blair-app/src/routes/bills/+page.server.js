import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { sanitizeSearch } from '$lib/utils.js';

const PAGE_SIZE = 20;

export async function load({ url }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const page = parseInt(url.searchParams.get('page') || '1');
	const status = url.searchParams.get('status') || 'active';
	const chamber = url.searchParams.get('chamber') || 'all';
	const alignment = url.searchParams.get('alignment') || 'all';
	const impact = url.searchParams.get('impact') || 'all';
	const search = sanitizeSearch(url.searchParams.get('q') || '');

	const offset = (page - 1) * PAGE_SIZE;

	let query = supabase
		.from('bills')
		.select(
			'id, bill_number, title, status, status_text, introduced_date, last_action, last_action_date, ai_summary, ai_tags, ai_alignment, ai_impact_tier, chamber',
			{ count: 'exact' }
		);

	if (status === 'active') {
		query = query.in('status', [1, 2, 3]).eq('is_archived', false);
	} else if (status === 'passed') {
		query = query.eq('status', 4);
	} else if (status === 'vetoed') {
		query = query.eq('status', 5);
	} else if (status === 'failed') {
		query = query.eq('status', 6);
	} else if (status === 'dead') {
		query = query.in('status', [1, 2, 3]).eq('is_archived', true);
	}

	if (chamber !== 'all') {
		query = query.eq('chamber', chamber);
	}

	if (alignment === 'for_people') {
		query = query.eq('ai_alignment', 'for_people');
	} else if (alignment === 'for_capital') {
		query = query.eq('ai_alignment', 'for_capital');
	} else if (alignment === 'neutral') {
		query = query.eq('ai_alignment', 'neutral');
	}

	if (impact !== 'all') {
		query = query.eq('ai_impact_tier', parseInt(impact));
	}

	if (search) {
		query = query.or(`bill_number.ilike.%${search}%,title.ilike.%${search}%`);
	}

	query = query.order('last_action_date', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);

	const { data: bills, count } = await query;

	return {
		bills: bills || [],
		totalCount: count || 0,
		page,
		totalPages: Math.ceil((count || 0) / PAGE_SIZE),
		filters: { status, chamber, alignment, impact, search }
	};
}
