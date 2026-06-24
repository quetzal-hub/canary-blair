<script>
	import { formatDate } from '$lib/utils.js';

	let { digest } = $props();
</script>

<article class="digest-card">
	<div class="digest-header">
		<span class="digest-period">{formatDate(digest.period_start)}{digest.period_start !== digest.period_end ? ` — ${formatDate(digest.period_end)}` : ''}</span>
		<span class="digest-type">{digest.period_type}</span>
	</div>
	<p class="digest-summary">{digest.summary}</p>
</article>

<style>
	.digest-card {
		padding: var(--space-md) var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.digest-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-sm);
	}
	.digest-period {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--color-accent);
	}
	.digest-type {
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-dim);
		font-weight: 600;
	}
	.digest-summary {
		font-size: 0.9375rem;
		line-height: 1.65;
		color: var(--color-text);
	}
</style>
