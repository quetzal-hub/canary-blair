import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { buildRss, RSS_HEADERS } from '$lib/rss.js';

// One feed per topic: new/updated bills tagged e.g. water, workers, healthcare.
export async function GET({ params, url }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const tag = params.tag.toLowerCase();

	const { data: bills } = await supabase
		.from('bills')
		.select('id, bill_number, title, ai_summary, ai_alignment, last_action, last_action_date')
		.contains('ai_tags', [tag])
		.order('last_action_date', { ascending: false, nullsFirst: false })
		.limit(50);

	const origin = url.origin;
	const items = (bills || []).map((b) => ({
		title: `${b.bill_number}: ${b.title}`,
		link: `${origin}/bills/${b.id}`,
		guid: `${origin}/bills/${b.id}`,
		pubDate: b.last_action_date,
		description: `${b.ai_summary || b.title}${b.last_action ? ` (${b.last_action})` : ''}`
	}));

	const xml = buildRss({
		title: `Canary Blair — bills tagged "${tag}"`,
		description: `West Virginia bills related to ${tag}, newest activity first.`,
		siteUrl: `${origin}/bills?tag=${encodeURIComponent(tag)}`,
		feedUrl: `${origin}/feeds/tag/${encodeURIComponent(tag)}.xml`,
		items
	});

	return new Response(xml, { headers: RSS_HEADERS });
}
