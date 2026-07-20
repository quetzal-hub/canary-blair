import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { buildRss, RSS_HEADERS } from '$lib/rss.js';
import { voteText } from '$lib/utils.js';
import { error } from '@sveltejs/kit';

// One feed per legislator: their most recent votes as they happen.
export async function GET({ params, url }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const id = parseInt(params.id);

	const { data: member } = await supabase
		.from('members')
		.select('id, full_name, party, chamber, canary_score')
		.eq('id', id)
		.single();

	if (!member) error(404, 'Member not found');

	const { data: votes } = await supabase
		.from('votes')
		.select('vote_value, roll_calls(date), bills(id, bill_number, title, ai_summary)')
		.eq('member_id', id)
		.order('roll_calls(date)', { ascending: false, nullsFirst: false })
		.limit(50);

	const origin = url.origin;
	const items = (votes || [])
		.filter((v) => v.bills)
		.map((v) => ({
			title: `${member.full_name} voted ${voteText(v.vote_value)} on ${v.bills.bill_number}`,
			link: `${origin}/bills/${v.bills.id}`,
			guid: `${origin}/bills/${v.bills.id}#member-${id}`,
			pubDate: v.roll_calls?.date,
			description: `${v.bills.title}${v.bills.ai_summary ? ` — ${v.bills.ai_summary}` : ''}`
		}));

	const xml = buildRss({
		title: `Canary Blair — ${member.full_name} (${member.party})`,
		description: `Every vote cast by ${member.full_name}. Canary Score: ${member.canary_score ?? 'unscored'}.`,
		siteUrl: `${origin}/members/${id}`,
		feedUrl: `${origin}/feeds/member/${id}.xml`,
		items
	});

	return new Response(xml, { headers: RSS_HEADERS });
}
