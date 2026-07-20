import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { buildRss, RSS_HEADERS } from '$lib/rss.js';
import { formatDate } from '$lib/utils.js';

// The plain-language "what happened in the legislature" digests.
export async function GET({ url }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const { data: digests } = await supabase
		.from('session_digests')
		.select('id, period_type, period_start, period_end, summary, created_at')
		.order('period_start', { ascending: false })
		.limit(40);

	const origin = url.origin;
	const label = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
	const items = (digests || []).map((d) => ({
		title: `${label[d.period_type] || d.period_type} digest — ${formatDate(d.period_start)}`,
		link: `${origin}/`,
		guid: `${origin}/digest/${d.id}`,
		pubDate: d.created_at || d.period_start,
		description: d.summary
	}));

	const xml = buildRss({
		title: 'Canary Blair — Legislative Digests',
		description: 'Plain-language summaries of what the West Virginia Legislature did.',
		siteUrl: origin,
		feedUrl: `${origin}/feeds/digest.xml`,
		items
	});

	return new Response(xml, { headers: RSS_HEADERS });
}
