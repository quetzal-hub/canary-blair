import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// A public accountability tool is only useful if people can find it. This lets
// search engines index every legislator and bill, so someone Googling their
// representative's name can land on their record.
export async function GET({ url }) {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const origin = url.origin;

	const [{ data: members }, { data: bills }, { data: committees }] = await Promise.all([
		supabase.from('members').select('id, canary_score_updated_at'),
		supabase.from('bills').select('id, updated_at'),
		supabase.from('committees').select('id')
	]);

	const staticPaths = ['', '/bills', '/members', '/find', '/about', '/stats', '/governor', '/officials', '/leadership', '/committees', '/graveyard', '/theater', '/contested', '/compare', '/feeds', '/data'];

	const urls = [
		...staticPaths.map((p) => ({ loc: `${origin}${p}` })),
		...(members || []).map((m) => ({ loc: `${origin}/members/${m.id}`, lastmod: m.canary_score_updated_at })),
		...(bills || []).map((b) => ({ loc: `${origin}/bills/${b.id}`, lastmod: b.updated_at })),
		...(committees || []).map((c) => ({ loc: `${origin}/committees/${c.id}` }))
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map((u) => {
		const lastmod = u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : '';
		return `  <url><loc>${u.loc}</loc>${lastmod}</url>`;
	})
	.join('\n')}
</urlset>
`;

	return new Response(body, {
		headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }
	});
}
