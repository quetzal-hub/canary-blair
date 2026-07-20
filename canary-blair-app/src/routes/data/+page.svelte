<svelte:head>
	<title>Open Data — Canary Blair</title>
</svelte:head>

<div class="container">
	<h1>Open Data</h1>
	<p class="subtitle">
		The whole scoreboard, free to download. No account, no key, no scraping required — built for
		journalists, researchers, and anyone who wants to check our work or build something new.
	</p>

	<section class="data-section">
		<h2>Legislator scores</h2>
		<p>Every legislator with their Canary Score, tier, badges, and whether they're currently sitting.</p>
		<div class="links">
			<a class="data-link" href="/data/members.csv" download>Download CSV</a>
			<a class="data-link" href="/data/members.json">View JSON</a>
		</div>
	</section>

	<p class="note">
		Legislative data originates from <a href="https://legiscan.com/" target="_blank" rel="noopener noreferrer">LegiScan</a>.
		Canary Scores are computed by this project and released to the public domain — attribution appreciated, not required.
		Prefer to follow changes instead of pulling snapshots? Use the <a href="/feeds">RSS feeds</a>.
	</p>
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle { color: var(--color-text-muted); font-size: 0.9375rem; line-height: 1.6; margin-bottom: var(--space-xl); }
	.data-section {
		margin-bottom: var(--space-xl);
		padding: var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.data-section h2 { margin-bottom: var(--space-sm); font-size: 1.0625rem; }
	.data-section p { color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: var(--space-md); }
	.links { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
	.data-link {
		padding: 0.5rem 1rem;
		background: var(--color-accent);
		color: #1a1a1a;
		border-radius: 6px;
		font-weight: 600;
		font-size: 0.875rem;
	}
	.data-link:hover { opacity: 0.9; text-decoration: none; }
	.note { font-size: 0.8125rem; color: var(--color-text-dim); line-height: 1.6; }
</style>
