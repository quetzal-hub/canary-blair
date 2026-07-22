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

// A vote counts as "genuinely contested" if the winning side took ≤75% — at
// least a quarter of the voting chamber broke ranks. We look only at PASSAGE
// votes (not amendments, whose direction is ambiguous without reading them),
// on bills with a clear people/capital stake, so "the people's side" is
// unambiguous: yea on a for_people bill, nay on a for_capital one.
const CONTESTED_MAX_WIN_SHARE = 0.75;

function isPassageVote(desc) {
	const d = desc || '';
	return /passed|passage|third reading|concurred/i.test(d) && !/amend|reject|reconsider|table|postpone/i.test(d);
}

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const bills = await fetchAll(
		supabase,
		'bills',
		'id, bill_number, title, ai_alignment, ai_impact_tier',
		(q) => q.in('ai_alignment', ['for_people', 'for_capital'])
	);
	const billById = new Map(bills.map((b) => [b.id, b]));

	const rollCalls = await fetchAll(supabase, 'roll_calls', 'id, bill_id, chamber, yea, nay, description');

	// Count the denominator: how many passage votes on aligned bills there were
	// at all, so we can say "N of M were even close."
	let totalPassageVotes = 0;
	const contested = [];
	for (const rc of rollCalls) {
		const bill = billById.get(rc.bill_id);
		if (!bill || !isPassageVote(rc.description)) continue;
		const total = (rc.yea || 0) + (rc.nay || 0);
		if (total < 5) continue;
		totalPassageVotes++;
		const winShare = Math.max(rc.yea, rc.nay) / total;
		if (winShare > CONTESTED_MAX_WIN_SHARE) continue;
		const forPeople = bill.ai_alignment === 'for_people';
		const peopleWon = forPeople ? rc.yea > rc.nay : rc.nay > rc.yea;
		contested.push({
			bill_id: bill.id,
			bill_number: bill.bill_number,
			title: bill.title,
			alignment: bill.ai_alignment,
			impact_tier: bill.ai_impact_tier,
			chamber: rc.chamber,
			yea: rc.yea,
			nay: rc.nay,
			winShare,
			peopleWon
		});
	}
	contested.sort((a, b) => a.winShare - b.winShare); // closest first

	return {
		contested,
		totalPassageVotes,
		peopleWins: contested.filter((c) => c.peopleWon).length,
		peopleLosses: contested.filter((c) => !c.peopleWon).length
	};
}
