<script>
	import BillCard from '$lib/components/BillCard.svelte';
	import { chamberLabel } from '$lib/utils.js';

	let { data } = $props();
	const { committee, bills, died } = data;
</script>

<svelte:head>
	<title>{committee.name} — Canary Blair</title>
</svelte:head>

<div class="container">
	<a href="/committees" class="back-link">← All committees</a>

	<h1>{committee.name}</h1>
	<p class="meta">{chamberLabel(committee.chamber)} committee · {bills.length} bills{#if died > 0} · <span class="died">{died} died here</span>{/if}</p>

	{#if died > 0}
		<p class="note">
			A bill "dying here" means it was referred to this committee and never made it out — no floor
			vote, no accountability. It's the most common way legislation quietly disappears.
		</p>
	{/if}

	<div class="bill-list">
		{#each bills as bill (bill.id)}
			<BillCard {bill} />
		{:else}
			<p class="empty">No bills recorded for this committee yet.</p>
		{/each}
	</div>
</div>

<style>
	.back-link { display: inline-block; font-size: 0.8125rem; color: var(--color-text-muted); margin-bottom: var(--space-lg); }
	h1 { margin-bottom: var(--space-xs); }
	.meta { color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: var(--space-md); }
	.died { color: var(--color-nay); font-weight: 600; }
	.note {
		font-size: 0.8125rem; color: var(--color-text-muted); line-height: 1.6;
		background: var(--color-bg-raised); border: 1px solid var(--color-border);
		border-radius: 8px; padding: var(--space-md); margin-bottom: var(--space-lg);
	}
	.bill-list { display: flex; flex-direction: column; gap: var(--space-md); }
	.empty { color: var(--color-text-dim); text-align: center; padding: var(--space-2xl) 0; }
</style>
