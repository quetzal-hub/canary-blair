// Dynamic robots.txt so the Sitemap URL uses the real deployed origin.
export function GET({ url }) {
	const body = `User-agent: *
Allow: /
Disallow: /my-reps

Sitemap: ${url.origin}/sitemap.xml
`;
	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }
	});
}
