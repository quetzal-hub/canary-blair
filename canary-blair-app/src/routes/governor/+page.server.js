import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { error } from '@sveltejs/kit';

// How many itemized actions to send for the audit trail; the rest fold into totals.
const BREAKDOWN_LIMIT = 60;

const GOV_NEWS_URL = 'https://governor.wv.gov/news';

function categorize(title) {
	const t = title.toLowerCase();
	if (/state of emergency|state of preparedness|disaster|presidential disaster|flooding/.test(t)) return 'emergency';
	if (/appoint|nominat|welcomes .+ as |names .+ (secretary|director|commissioner|chief)|swears in/.test(t)) return 'appointment';
	if (/pardon|clemency|commut/.test(t)) return 'clemency';
	if (/flags? (lowered|at half|to be lowered|be flown)|honor the (life|memory)/.test(t)) return 'memorial';
	return 'announcement';
}

/**
 * Live-scrape the Governor's official news feed for FACTS we record but never
 * grade — emergency declarations, appointments, clemency, and other official
 * actions. Fetched at request time so it stays current; wrapped so a failure
 * (site down, markup change) just hides the section rather than breaking the page.
 */
async function fetchGovernorFacts() {
	try {
		const res = await fetch(GOV_NEWS_URL, { signal: AbortSignal.timeout(6000) });
		if (!res.ok) return null;
		const html = await res.text();
		const blocks = html.split('newsarticlegroup').slice(1);
		const items = [];
		for (const b of blocks) {
			const title = (b.match(/<strong>([^<]+)<\/strong>/) || [])[1];
			const date = (b.match(/datetime="([^"]+)"/) || [])[1];
			const href = (b.match(/href="(\/article\/[^"]+)"/) || [])[1];
			if (!title) continue;
			items.push({
				title: title.trim().replace(/^Governor (Patrick )?Morrisey /i, ''),
				date: date ? date.slice(0, 10) : null,
				url: href ? `https://governor.wv.gov${href}` : GOV_NEWS_URL,
				category: categorize(title)
			});
		}
		const byCat = (c) => items.filter((i) => i.category === c);
		return {
			emergency: byCat('emergency'),
			appointment: byCat('appointment'),
			clemency: byCat('clemency'),
			other: [...byCat('announcement'), ...byCat('memorial')].slice(0, 10)
		};
	} catch {
		return null;
	}
}

export async function load() {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const [{ data: governor }, facts] = await Promise.all([
		supabase.from('officials').select('*').eq('slug', 'governor').single(),
		fetchGovernorFacts()
	]);
	if (!governor) error(404, 'Governor data not yet loaded');

	const breakdown = governor.score_breakdown || null;
	const items = breakdown?.items || [];

	return {
		governor,
		facts,
		breakdown: breakdown
			? {
					items: items.slice(0, BREAKDOWN_LIMIT),
					itemsTruncated: Math.max(0, items.length - BREAKDOWN_LIMIT),
					totals: breakdown.totals || {}
				}
			: null
	};
}
