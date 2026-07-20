/**
 * Minimal, dependency-free RSS 2.0 builder.
 *
 * RSS is the privacy-first alert channel: anonymous, no accounts, no email, no
 * infrastructure. Journalists and organizers can follow a legislator or a topic
 * without us ever knowing who they are.
 */

function esc(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function rfc822(dateStr) {
	if (!dateStr) return new Date().toUTCString();
	// Accept 'YYYY-MM-DD' or full ISO; anchor bare dates to UTC midnight.
	const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00Z' : dateStr);
	return isNaN(d) ? new Date().toUTCString() : d.toUTCString();
}

/**
 * @param {object} feed
 * @param {string} feed.title
 * @param {string} feed.description
 * @param {string} feed.siteUrl   canonical HTML page this feed mirrors
 * @param {string} feed.feedUrl   this feed's own URL (for atom:self)
 * @param {Array}  feed.items     { title, link, description, guid, pubDate }
 */
export function buildRss({ title, description, siteUrl, feedUrl, items }) {
	const now = new Date().toUTCString();
	const body = items
		.map(
			(it) => `    <item>
      <title>${esc(it.title)}</title>
      <link>${esc(it.link)}</link>
      <guid isPermaLink="false">${esc(it.guid || it.link)}</guid>
      <pubDate>${rfc822(it.pubDate)}</pubDate>
      <description>${esc(it.description || '')}</description>
    </item>`
		)
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(siteUrl)}</link>
    <atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml" />
    <description>${esc(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>Canary Blair</generator>
${body}
  </channel>
</rss>
`;
}

export const RSS_HEADERS = {
	'Content-Type': 'application/rss+xml; charset=utf-8',
	// Feed readers poll frequently; let the CDN absorb it.
	'Cache-Control': 'public, max-age=1800'
};
