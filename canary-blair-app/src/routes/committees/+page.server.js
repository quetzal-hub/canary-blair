import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const [{ data: committees }, { data: bills }] = await Promise.all([
		supabase.from('committees').select('id, name, chamber'),
		supabase.from('bills').select('committee_id, status').not('committee_id', 'is', null)
	]);

	// Aggregate bill counts per committee, including how many died there
	// (status 6 = Failed/Dead) — the whole point of the view.
	const counts = new Map();
	for (const b of bills || []) {
		const c = counts.get(b.committee_id) || { total: 0, died: 0 };
		c.total++;
		if (b.status === 6) c.died++;
		counts.set(b.committee_id, c);
	}

	const rows = (committees || [])
		.map((c) => ({ ...c, ...(counts.get(c.id) || { total: 0, died: 0 }) }))
		.filter((c) => c.total > 0)
		.sort((a, b) => b.total - a.total);

	return { committees: rows };
}
