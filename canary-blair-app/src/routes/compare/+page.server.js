import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export async function load({ url }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const aId = url.searchParams.get('a');
	const bId = url.searchParams.get('b');

	const fetchOne = async (id) => {
		if (!id) return null;
		const [{ data: member }, { data: summary }] = await Promise.all([
			supabase.from('members').select('*').eq('id', parseInt(id)).single(),
			supabase.from('member_vote_summary').select('*').eq('member_id', parseInt(id)).single()
		]);
		if (!member) return null;
		return { ...member, summary: summary || null };
	};

	const [allMembers, a, b] = await Promise.all([
		supabase
			.from('members')
			.select('id, full_name, party, chamber')
			.order('full_name')
			.then((r) => r.data || []),
		fetchOne(aId),
		fetchOne(bId)
	]);

	return { allMembers, a, b, aId, bId };
}
