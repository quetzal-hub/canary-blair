import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Normalize committee-name formatting variants ("Health & Human Resources" vs
// "Health and Human Resources") so the same committee groups together.
function normCommittee(name) {
	if (!name) return 'No committee recorded';
	return name.replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim();
}

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

	// Bills that ever reached a roll call — anything NOT here never got a recorded vote.
	const rollCalls = await fetchAll(supabase, 'roll_calls', 'bill_id');
	const votedBillIds = new Set(rollCalls.map((r) => r.bill_id));

	// High-impact (Landmark/High Impact) bills the AI classified as for_people.
	const bills = await fetchAll(
		supabase,
		'bills',
		'id, bill_number, title, ai_impact_tier, ai_who_benefits, committee_id, committee_name, chamber',
		(q) => q.eq('ai_alignment', 'for_people').in('ai_impact_tier', [1, 2])
	);

	// Died without a vote = never appeared in any roll call.
	const dead = bills.filter((b) => !votedBillIds.has(b.id));

	// Committee chairs (schema/019, populated by committee-scrape.js). Keyed by
	// normalized committee name + chamber, since Judiciary/Finance/etc. exist in
	// both chambers. Empty until the scrape runs — the page degrades gracefully.
	const { data: chairRows } = await supabase
		.from('committee_memberships')
		.select('committee_name, chamber, member_display, members(id, full_name)')
		.eq('role', 'chair');
	const chairByKey = new Map();
	for (const c of chairRows || []) {
		chairByKey.set(`${normCommittee(c.committee_name)}|${c.chamber}`, {
			member_id: c.members?.id || null,
			name: c.members?.full_name || c.member_display
		});
	}

	// Group by (normalized committee name + chamber), biggest graveyards first.
	const groups = new Map();
	for (const b of dead) {
		const norm = normCommittee(b.committee_name);
		const key = `${norm}|${b.chamber}`;
		if (!groups.has(key)) {
			groups.set(key, {
				committee: norm,
				chamber: b.chamber,
				committee_id: b.committee_id || null,
				chair: chairByKey.get(key) || null,
				bills: []
			});
		}
		groups.get(key).bills.push(b);
	}
	const committees = [...groups.values()]
		.map((g) => ({
			...g,
			bills: g.bills.sort((a, b) => a.ai_impact_tier - b.ai_impact_tier || a.bill_number.localeCompare(b.bill_number))
		}))
		.sort((a, b) => b.bills.length - a.bills.length);

	return {
		totalDead: dead.length,
		landmarkDead: dead.filter((b) => b.ai_impact_tier === 1).length,
		committees
	};
}
