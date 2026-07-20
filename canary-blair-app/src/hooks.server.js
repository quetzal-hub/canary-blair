/**
 * Security headers applied to every response.
 *
 * The CSP intentionally allows 'unsafe-inline' for scripts/styles because
 * SvelteKit's hydration and the PWA service-worker registration inject inline
 * code, and this app has no user-generated HTML to protect against (all data
 * is government records, escaped by Svelte on render). It still restricts where
 * the page can load resources from and connect to, and blocks framing.
 *
 * Upgrade path: move to nonce-based CSP via `kit.csp` in svelte.config.js and
 * drop 'unsafe-inline' from script-src once verified against the service worker
 * on a preview deploy.
 */
const CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' https: data:", // member photos come from LegiScan/Wikipedia https URLs
	"font-src 'self'",
	"connect-src 'self' https://*.supabase.co", // browser talks to Supabase (public anon key)
	"worker-src 'self'", // PWA service worker
	"manifest-src 'self'",
	"frame-ancestors 'none'", // no clickjacking
	"base-uri 'self'",
	"form-action 'self'",
	"object-src 'none'",
	'upgrade-insecure-requests'
].join('; ');

const SECURITY_HEADERS = {
	'Content-Security-Policy': CSP,
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), interest-cohort=()',
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

export async function handle({ event, resolve }) {
	const response = await resolve(event);
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
}
