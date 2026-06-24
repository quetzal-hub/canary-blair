<script>
	import BillStatusBadge from './BillStatusBadge.svelte';
	import TagPill from './TagPill.svelte';
	import { formatDate, formatDateShort, daysSince, truncate, getBillImpactTier } from '$lib/utils.js';

	let { bill } = $props();

	const alignmentLabels = {
		for_people: { label: 'For People', cssClass: 'alignment-people' },
		for_capital: { label: 'For Capital', cssClass: 'alignment-capital' },
		neutral: { label: 'Neutral', cssClass: 'alignment-neutral' }
	};

	const alignment = $derived(bill.ai_alignment ? alignmentLabels[bill.ai_alignment] : null);
	const impactTier = $derived(getBillImpactTier(bill.ai_impact_tier));
	const daysAgo = $derived(daysSince(bill.last_action_date));
</script>

<a href="/bills/{bill.id}" class="bill-card">
	<div class="bill-header">
		<span class="bill-number">{bill.bill_number}</span>
		<BillStatusBadge status={bill.status} />
		{#if alignment}
			<span class="alignment-badge {alignment.cssClass}">{alignment.label}</span>
		{/if}
		{#if impactTier}
			<span class="impact-badge">{impactTier.emoji} {impactTier.name}</span>
		{/if}
	</div>
	<h3 class="bill-title">{bill.title}</h3>
	{#if bill.ai_summary}
		<p class="bill-summary">{truncate(bill.ai_summary, 150)}</p>
	{/if}
	{#if bill.last_action}
		<p class="bill-last-action">
			<span class="action-label">Last action:</span> {bill.last_action}
			{#if bill.last_action_date}
				<span class="action-date">— {formatDateShort(bill.last_action_date)}{#if daysAgo != null && daysAgo <= 90} ({daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`}){/if}</span>
			{/if}
		</p>
	{/if}
	<div class="bill-footer">
		<div class="bill-dates">
			{#if bill.introduced_date}
				<span class="bill-date">Introduced {formatDateShort(bill.introduced_date)}</span>
			{/if}
		</div>
		{#if bill.ai_tags?.length}
			<div class="bill-tags">
				{#each bill.ai_tags.slice(0, 3) as tag}
					<TagPill {tag} />
				{/each}
			</div>
		{/if}
	</div>
</a>

<style>
	.bill-card {
		display: block;
		padding: var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		text-decoration: none;
		color: var(--color-text);
		transition: background 0.15s;
	}
	.bill-card:hover {
		background: var(--color-bg-hover);
		text-decoration: none;
	}
	.bill-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-xs);
	}
	.bill-number {
		font-weight: 700;
		font-size: 0.875rem;
		color: var(--color-accent);
	}
	.bill-title {
		font-size: 0.9375rem;
		font-weight: 500;
		margin-bottom: var(--space-sm);
		line-height: 1.4;
	}
	.bill-summary {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-bottom: var(--space-sm);
		line-height: 1.5;
	}
	.bill-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	.bill-last-action {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-bottom: var(--space-sm);
		line-height: 1.4;
	}
	.action-label {
		font-weight: 600;
		color: var(--color-text-dim);
	}
	.action-date {
		color: var(--color-text-dim);
	}
	.bill-dates {
		display: flex;
		gap: var(--space-sm);
	}
	.bill-date {
		font-size: 0.75rem;
		color: var(--color-text-dim);
	}
	.bill-tags {
		display: flex;
		gap: var(--space-xs);
		flex-wrap: wrap;
	}
	.alignment-badge {
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.alignment-people {
		background: var(--color-yea);
		color: #fff;
	}
	.alignment-capital {
		background: var(--color-nay);
		color: #fff;
	}
	.alignment-neutral {
		background: var(--color-border);
		color: var(--color-text-muted);
	}
	.impact-badge {
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--color-text-dim);
	}
</style>
