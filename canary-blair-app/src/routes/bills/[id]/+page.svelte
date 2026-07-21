<script>
	import BillStatusBadge from '$lib/components/BillStatusBadge.svelte';
	import TagPill from '$lib/components/TagPill.svelte';
	import VoteTable from '$lib/components/VoteTable.svelte';
	import PartyBadge from '$lib/components/PartyBadge.svelte';
	import { formatDate, chamberLabel, getBillImpactTier } from '$lib/utils.js';

	let { data } = $props();
	const bill = data.bill;
	const impact = $derived(getBillImpactTier(bill.ai_impact_tier));
</script>

<svelte:head>
	<title>{bill.bill_number}: {bill.title} — Canary Blair</title>
</svelte:head>

<div class="container">
	<a href="/bills" class="back-link">← Back to bills</a>

	<header class="bill-header">
		<div class="bill-meta">
			<span class="bill-number">{bill.bill_number}</span>
			<BillStatusBadge status={bill.status} />
			{#if bill.chamber}
				<span class="chamber">{chamberLabel(bill.chamber)}</span>
			{/if}
		</div>
		<h1>{bill.title}</h1>
		{#if bill.description}
			<p class="description">{bill.description}</p>
		{/if}
		<div class="dates">
			{#if bill.introduced_date}
				<span>Introduced: {formatDate(bill.introduced_date)}</span>
			{/if}
			{#if bill.last_action_date}
				<span>Last action: {formatDate(bill.last_action_date)}</span>
			{/if}
		</div>
		{#if impact || bill.ai_alignment}
			<div class="bill-badges">
				{#if impact}
					<span class="impact-badge {impact.cssClass}" title={impact.desc}>
						{impact.emoji} {impact.name}
						<span class="impact-weight">{impact.weight}</span>
					</span>
				{/if}
				{#if bill.ai_alignment === 'for_people'}
					<span class="alignment-badge alignment-people">For the People</span>
				{:else if bill.ai_alignment === 'for_capital'}
					<span class="alignment-badge alignment-capital">For Capital</span>
				{:else if bill.ai_alignment === 'neutral'}
					<span class="alignment-badge alignment-neutral">Neutral</span>
				{/if}
				{#if bill.ai_confidence === 'low'}
					<span class="confidence-badge" title="The AI flagged this classification as low-confidence — treat it with caution; it's a candidate for human review.">⚠ low confidence</span>
				{/if}
			</div>
		{/if}
	</header>

	<section class="section">
		<h2>Plain English Summary</h2>
		{#if bill.ai_summary}
			<div class="ai-block">
				<div class="ai-item">
					<h3>What this bill does</h3>
					<p>{bill.ai_summary}</p>
				</div>
				{#if bill.ai_who_benefits}
					<div class="ai-item">
						<h3>Who benefits</h3>
						<p>{bill.ai_who_benefits}</p>
					</div>
				{/if}
				{#if bill.ai_who_is_hurt}
					<div class="ai-item">
						<h3>Who is hurt</h3>
						<p>{bill.ai_who_is_hurt}</p>
					</div>
				{/if}
				{#if bill.ai_reasoning}
					<div class="ai-item">
						<h3>Why this classification</h3>
						<p>{bill.ai_reasoning}</p>
					</div>
				{/if}
				{#if bill.ai_critical_points?.length}
					<div class="ai-item">
						<h3>Key Provisions</h3>
						<ul class="critical-points">
							{#each bill.ai_critical_points as point}
								<li>{point}</li>
							{/each}
						</ul>
					</div>
				{/if}
				{#if bill.ai_tags?.length}
					<div class="tags">
						{#each bill.ai_tags as tag}
							<TagPill {tag} />
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<p class="placeholder">Summary coming soon.</p>
		{/if}
	</section>

	<!-- Sponsors -->
	{#if bill.bill_sponsors?.length}
		<section class="section">
			<h2>Sponsors</h2>
			<ul class="sponsor-list">
				{#each bill.bill_sponsors as s}
					{#if s.members}
						<li>
							<a href="/members/{s.members.id}">
								<PartyBadge party={s.members.party} />
								{s.members.full_name}
							</a>
							{#if s.sponsor_type === 1}
								<span class="primary-badge">Primary</span>
							{/if}
						</li>
					{/if}
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Action History -->
	{#if data.actions.length}
		<section class="section">
			<h2>Action History</h2>
			<div class="timeline">
				{#each data.actions as action}
					<div class="timeline-item">
						<span class="timeline-date">{formatDate(action.action_date)}</span>
						<span class="timeline-text">{action.action_text}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Roll Calls & Votes -->
	{#if data.rollCalls.length}
		<section class="section">
			<h2>Votes</h2>
			{#each data.rollCalls as rc}
				<div class="roll-call">
					<div class="rc-header">
						<span class="rc-date">{formatDate(rc.date)}</span>
						<div class="rc-counts">
							<span class="count yea">Yea: {rc.yea}</span>
							<span class="count nay">Nay: {rc.nay}</span>
							<span class="count nv">NV: {rc.nv}</span>
							<span class="count absent">Absent: {rc.absent}</span>
						</div>
						<span class="rc-result" class:passed={rc.passed} class:failed={!rc.passed}>
							{rc.passed ? 'PASSED' : 'FAILED'}
						</span>
					</div>
					{#if rc.description}
						<p class="rc-description">{rc.description}</p>
					{/if}
					{#if rc.votes?.length}
						<VoteTable votes={rc.votes} />
					{/if}
				</div>
			{/each}
		</section>
	{/if}

	{#if bill.bill_text_url}
		<section class="section">
			<a href={bill.bill_text_url} target="_blank" rel="noopener" class="text-link">
				View Full Bill Text →
			</a>
		</section>
	{/if}
</div>

<style>
	.back-link {
		display: inline-block;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-bottom: var(--space-lg);
	}

	.bill-header {
		margin-bottom: var(--space-xl);
	}
	.bill-meta {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}
	.bill-number {
		font-weight: 700;
		font-size: 1.125rem;
		color: var(--color-accent);
	}
	.chamber {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	h1 {
		margin-bottom: var(--space-sm);
	}
	.description {
		color: var(--color-text-muted);
		margin-bottom: var(--space-sm);
	}
	.dates {
		display: flex;
		gap: var(--space-lg);
		font-size: 0.8125rem;
		color: var(--color-text-dim);
	}

	.bill-badges {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
		margin-top: var(--space-md);
	}
	.impact-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.impact-weight {
		font-size: 0.6875rem;
		opacity: 0.7;
	}
	.impact-1 { background: #dc262620; color: #dc2626; border: 1px solid #dc262640; }
	.impact-2 { background: #ea580c20; color: #ea580c; border: 1px solid #ea580c40; }
	.impact-3 { background: #ca8a0420; color: #ca8a04; border: 1px solid #ca8a0440; }
	.impact-4 { background: #2563eb20; color: #2563eb; border: 1px solid #2563eb40; }
	.impact-5 { background: #6b728020; color: #6b7280; border: 1px solid #6b728040; }
	.impact-6 { background: #9ca3af20; color: #9ca3af; border: 1px solid #9ca3af40; }
	.alignment-badge {
		display: inline-block;
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.alignment-people { background: #16a34a20; color: #16a34a; border: 1px solid #16a34a40; }
	.alignment-capital { background: #dc262620; color: #dc2626; border: 1px solid #dc262640; }
	.alignment-neutral { background: #6b728020; color: #6b7280; border: 1px solid #6b728040; }
	.confidence-badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		background: var(--color-bg-hover);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
	}

	.critical-points {
		list-style: disc;
		padding-left: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		line-height: 1.6;
	}

	.section {
		margin-bottom: var(--space-xl);
	}
	.section h2 {
		margin-bottom: var(--space-md);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.ai-block {
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: var(--space-lg);
	}
	.ai-item {
		margin-bottom: var(--space-md);
	}
	.ai-item:last-child {
		margin-bottom: 0;
	}
	.ai-item h3 {
		font-size: 0.875rem;
		color: var(--color-accent);
		margin-bottom: var(--space-xs);
	}
	.ai-item p {
		line-height: 1.6;
	}
	.tags {
		display: flex;
		gap: var(--space-xs);
		flex-wrap: wrap;
		margin-top: var(--space-md);
	}
	.placeholder {
		color: var(--color-text-dim);
		font-style: italic;
	}

	.sponsor-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.sponsor-list li {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.sponsor-list a {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		color: var(--color-text);
	}
	.primary-badge {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: var(--color-accent-dim);
		color: #fff;
		border-radius: 4px;
		font-weight: 600;
	}

	.timeline {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.timeline-item {
		display: flex;
		gap: var(--space-md);
		font-size: 0.875rem;
		padding: var(--space-sm) 0;
		border-bottom: 1px solid var(--color-border);
	}
	.timeline-date {
		flex-shrink: 0;
		width: 130px;
		color: var(--color-text-dim);
		font-size: 0.8125rem;
	}
	.timeline-text {
		color: var(--color-text-muted);
	}

	.roll-call {
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: var(--space-md);
		margin-bottom: var(--space-md);
	}
	.rc-header {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		flex-wrap: wrap;
		margin-bottom: var(--space-sm);
	}
	.rc-date {
		font-weight: 600;
		font-size: 0.875rem;
	}
	.rc-counts {
		display: flex;
		gap: var(--space-sm);
		font-size: 0.8125rem;
	}
	.count.yea { color: var(--color-yea); }
	.count.nay { color: var(--color-nay); }
	.count.nv, .count.absent { color: var(--color-nv); }
	.rc-result {
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
	}
	.rc-result.passed { background: var(--color-yea); color: #fff; }
	.rc-result.failed { background: var(--color-nay); color: #fff; }
	.rc-description {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-bottom: var(--space-md);
	}

	.text-link {
		display: inline-block;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-weight: 500;
	}

	@media (max-width: 600px) {
		.timeline-item {
			flex-direction: column;
			gap: var(--space-xs);
		}
		.timeline-date {
			width: auto;
		}
		.rc-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
