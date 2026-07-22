import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Executive offices in Board of Public Works order, Governor first.
const EXEC_ORDER = ['governor', 'attorney-general', 'secretary-of-state', 'auditor', 'treasurer', 'agriculture-commissioner'];

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const { data } = await supabase.from('officials').select('*').eq('is_current', true);
	const officials = data || [];

	const execRank = (slug) => {
		const i = EXEC_ORDER.indexOf(slug);
		return i === -1 ? EXEC_ORDER.length : i;
	};

	return {
		executive: officials
			.filter((o) => o.office_group === 'executive')
			.sort((a, b) => execRank(a.slug) - execRank(b.slug)),
		judicial: officials
			.filter((o) => o.office_group === 'judicial')
			// Chief Justice first, then alphabetical
			.sort((a, b) => (b.office.includes('Chief') ? 1 : 0) - (a.office.includes('Chief') ? 1 : 0) || a.full_name.localeCompare(b.full_name))
	};
}
