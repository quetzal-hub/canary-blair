import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Leadership hierarchy, top-down — not alphabetical. Any title not listed
// here (e.g. a new role that shows up after the next roster sync) sorts to
// the end, alphabetically among itself, rather than being dropped.
const RANK = [
	'Speaker of the House',
	'President of the Senate',
	'Speaker Pro Tempore, Deputy Speaker',
	'Deputy Speaker',
	'President Pro Tempore',
	'Majority Leader',
	'Assistant Majority Leader',
	'Assistant Majority Leaders',
	'Majority Whip',
	'Assistant Majority Whips',
	'Minority Leader',
	'Minority Leader Pro Tempore',
	'Deputy Minority Leader',
	'Assistant Minority Leader',
	'Minority Whip'
];

function rank(title) {
	const i = RANK.indexOf(title);
	return i === -1 ? RANK.length : i;
}

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const { data } = await supabase
		.from('members')
		.select('id, full_name, party, chamber, district, photo_url, leadership_title')
		.not('leadership_title', 'is', null)
		.eq('is_current', true);

	const sorted = (data || []).sort((a, b) => rank(a.leadership_title) - rank(b.leadership_title) || a.leadership_title.localeCompare(b.leadership_title));

	return {
		house: sorted.filter((m) => m.chamber === 'H'),
		senate: sorted.filter((m) => m.chamber === 'S')
	};
}
