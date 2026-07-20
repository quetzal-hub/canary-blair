import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const { data } = await supabase
		.from('members')
		.select('canary_score, canary_tier, party, chamber')
		.eq('is_current', true);

	const members = data || [];
	const scored = members.filter((m) => m.canary_score != null);
	const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, m) => s + m.canary_score, 0) / arr.length) : null);

	const groupAvg = (key, values) =>
		values.map((v) => {
			const g = scored.filter((m) => m[key] === v);
			return { value: v, avg: avg(g), count: g.length };
		});

	const tierCounts = {};
	for (let t = 1; t <= 6; t++) tierCounts[t] = scored.filter((m) => m.canary_tier === t).length;

	return {
		overall: avg(scored),
		scoredCount: scored.length,
		totalCount: members.length,
		unscored: members.length - scored.length,
		byParty: groupAvg('party', ['D', 'R']),
		byChamber: groupAvg('chamber', ['H', 'S']),
		tierCounts
	};
}
