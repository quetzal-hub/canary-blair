<script>
	// Canonical topic tags (same list the summarizer chooses from).
	const tags = [
		'water', 'environment', 'workers', 'education', 'healthcare', 'coal', 'energy',
		'corporations', 'taxes', 'housing', 'voting-rights', 'civil-rights', 'children',
		'elderly', 'public-safety', 'guns', 'criminal-justice', 'agriculture'
	];
</script>

<svelte:head>
	<title>RSS Feeds — Canary Blair</title>
	<link rel="alternate" type="application/rss+xml" title="Canary Blair — Legislative Digests" href="/feeds/digest.xml" />
</svelte:head>

<div class="container">
	<h1>Follow by RSS</h1>
	<p class="subtitle">
		No accounts. No email. No tracking. RSS is how you follow a legislator or a topic without us
		ever knowing who you are — the right tool for a project that refuses to collect data on you.
		Paste any feed URL below into your reader.
	</p>

	<section class="feed-section">
		<h2>📰 Legislative digests</h2>
		<p>Plain-language summaries of what the legislature did — daily, weekly, monthly, yearly.</p>
		<a class="feed-link" href="/feeds/digest.xml">/feeds/digest.xml</a>
	</section>

	<section class="feed-section">
		<h2>👤 A specific legislator</h2>
		<p>
			Every vote a legislator casts, as it happens. Find them in the
			<a href="/members">member directory</a>, then use their ID:
		</p>
		<code class="feed-pattern">/feeds/member/<span>[id]</span>.xml</code>
	</section>

	<section class="feed-section">
		<h2>🏷️ A topic</h2>
		<p>New activity on bills about a subject you care about:</p>
		<div class="tag-grid">
			{#each tags as tag}
				<a class="tag-feed" href="/feeds/tag/{tag}.xml">{tag}</a>
			{/each}
		</div>
		<p class="pattern-note">Pattern: <code>/feeds/tag/<span>[tag]</span>.xml</code></p>
	</section>
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		line-height: 1.6;
		margin-bottom: var(--space-xl);
	}
	.feed-section {
		margin-bottom: var(--space-xl);
		padding: var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.feed-section h2 { margin-bottom: var(--space-sm); font-size: 1.0625rem; }
	.feed-section p { color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.6; margin-bottom: var(--space-sm); }
	.feed-link, .feed-pattern {
		display: inline-block;
		font-family: ui-monospace, monospace;
		font-size: 0.875rem;
		color: var(--color-accent);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
	}
	.feed-pattern span { color: var(--color-text-dim); }
	.tag-grid {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin: var(--space-md) 0;
	}
	.tag-feed {
		font-size: 0.8125rem;
		padding: 0.25rem 0.6rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		color: var(--color-text-muted);
	}
	.tag-feed:hover { color: var(--color-accent); text-decoration: none; }
	.pattern-note { font-size: 0.8125rem; }
	.pattern-note code { color: var(--color-text-muted); }
	.pattern-note span { color: var(--color-text-dim); }
</style>
