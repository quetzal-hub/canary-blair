<script>
	import { chamberLabel } from '$lib/utils.js';
	let { data } = $props();
</script>

<svelte:head>
	<title>Committees — Canary Blair</title>
</svelte:head>

<div class="container">
	<h1>Committees</h1>
	<p class="subtitle">
		Most bills never get a floor vote — they're quietly sent to a committee and left to die.
		Here's where the bills went, and how many didn't come back out.
	</p>

	{#if data.committees.length === 0}
		<p class="empty">No committee data yet. It populates as bills are synced.</p>
	{:else}
		<div class="committee-list">
			{#each data.committees as c (c.id)}
				<a class="committee" href="/committees/{c.id}">
					<div class="c-main">
						<span class="c-name">{c.name}</span>
						<span class="c-chamber">{chamberLabel(c.chamber)}</span>
					</div>
					<div class="c-stats">
						<span class="stat"><strong>{c.total}</strong> bills</span>
						{#if c.died > 0}
							<span class="stat died"><strong>{c.died}</strong> died here</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle { color: var(--color-text-muted); font-size: 0.9375rem; line-height: 1.6; margin-bottom: var(--space-xl); }
	.empty { color: var(--color-text-dim); text-align: center; padding: var(--space-2xl) 0; }
	.committee-list { display: flex; flex-direction: column; gap: var(--space-sm); }
	.committee {
		display: flex; align-items: center; justify-content: space-between; gap: var(--space-md);
		padding: var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		color: var(--color-text);
	}
	.committee:hover { background: var(--color-bg-hover); text-decoration: none; }
	.c-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.c-name { font-weight: 600; font-size: 0.9375rem; }
	.c-chamber { font-size: 0.75rem; color: var(--color-text-dim); }
	.c-stats { display: flex; gap: var(--space-md); flex-shrink: 0; font-size: 0.8125rem; color: var(--color-text-muted); }
	.stat strong { color: var(--color-text); }
	.stat.died { color: var(--color-nay); }
	.stat.died strong { color: var(--color-nay); }
</style>
