import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

async function fetchAll(supabase, table, columns, filter) {
	const rows = [];
	let from = 0;
	const page = 1000;
	while (true) {
		let q = supabase.from(table).select(columns).range(from, from + page - 1);
		if (filter) q = filter(q);
		const { data } = await q;
		if (!data || data.length === 0) break;
		rows.push(...data);
		if (data.length < page) break;
		from += page;
	}
	return rows;
}

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const rollCalls = await fetchAll(supabase, 'roll_calls', 'bill_id, yea, nay');
	const votedBillIds = new Set(rollCalls.map((r) => r.bill_id));

	// Consensus vs contested. A roll call is "near-unanimous" if the winning side
	// took ≥85%; "genuinely contested" if the winning side was ≤70% (i.e. the
	// minority held ≥30%). Anything with <5 recorded votes is a voice-vote artifact.
	let consensus = 0, contested = 0;
	for (const rc of rollCalls) {
		const total = (rc.yea || 0) + (rc.nay || 0);
		if (total < 5) continue;
		const winShare = Math.max(rc.yea, rc.nay) / total;
		if (winShare >= 0.85) consensus++;
		else if (winShare <= 0.7) contested++;
	}

	// High-impact (Landmark/High Impact) bills: how many reached a floor vote vs died.
	const highImpact = await fetchAll(
		supabase,
		'bills',
		'id, ai_alignment',
		(q) => q.in('ai_alignment', ['for_people', 'for_capital']).in('ai_impact_tier', [1, 2])
	);
	const tally = (align) => {
		const set = highImpact.filter((b) => b.ai_alignment === align);
		const floor = set.filter((b) => votedBillIds.has(b.id)).length;
		return { floor, died: set.length - floor, total: set.length };
	};
	const people = tally('for_people');
	const capital = tally('for_capital');

	// Worked examples, pulled live so they stay real:
	// (a) a Landmark for_people bill that died in committee without a vote,
	// (b) a high-impact for_capital bill that passed (status 4).
	const buriedCandidates = await fetchAll(
		supabase,
		'bills',
		'id, bill_number, title, ai_impact_tier, ai_who_benefits, committee_name',
		(q) => q.eq('ai_alignment', 'for_people').in('ai_impact_tier', [1, 2]).order('ai_impact_tier', { ascending: true })
	);
	const buriedExample = buriedCandidates.find((b) => !votedBillIds.has(b.id)) || null;

	const { data: passedCapital } = await supabase
		.from('bills')
		.select('id, bill_number, title, ai_impact_tier, ai_who_benefits, ai_who_is_hurt')
		.eq('ai_alignment', 'for_capital')
		.in('ai_impact_tier', [1, 2])
		.eq('status', 4)
		.order('ai_impact_tier', { ascending: true })
		.limit(1);

	return {
		totalRollCalls: rollCalls.length,
		consensus,
		contested,
		people,
		capital,
		floorRatio: people.floor > 0 ? (capital.floor / people.floor).toFixed(1) : null,
		buriedExample,
		passedCapitalExample: passedCapital?.[0] || null
	};
}
