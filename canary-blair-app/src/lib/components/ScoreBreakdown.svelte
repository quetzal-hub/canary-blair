<script>
	import { getBillImpactTier, voteText } from '$lib/utils.js';

	let { breakdown, memberName } = $props();

	const alignmentLabels = {
		for_people: 'For People',
		for_capital: 'For Capital'
	};

	const t = $derived(breakdown.totals);
</script>

<details class="breakdown">
	<summary>
		<span class="summary-title">How we got this number</span>
		<span class="summary-hint">Every scored vote, with the points it added or subtracted →</span>
	</summary>

	<div class="breakdown-body">
		<p class="intro">
			The Canary Score isn't an opinion — it's arithmetic on {memberName}'s own record.
			Each vote on a bill our system classified as helping people or helping capital moves the
			score up or down, weighted by how consequential the bill is. Here's the full accounting.
		</p>

		<div class="totals-grid">
			<div class="total-card">
				<span class="total-num">{t.people_yea}</span>
				<span class="total-label">Yea on people-first bills</span>
			</div>
			<div class="total-card">
				<span class="total-num">{t.people_nay}</span>
				<span class="total-label">Nay on people-first bills</span>
			</div>
			<div class="total-card">
				<span class="total-num">{t.capital_yea}</span>
				<span class="total-label">Yea on corporate-first bills</span>
			</div>
			<div class="total-card">
				<span class="total-num">{t.capital_nay}</span>
				<span class="total-label">Nay on corporate-first bills</span>
			</div>
			<div class="total-card">
				<span class="total-num">{t.missed}</span>
				<span class="total-label">Missed (NV / absent)</span>
			</div>
			<div class="total-card">
				<span class="total-num">{t.scored_votes}</span>
				<span class="total-label">Total scored votes</span>
			</div>
		</div>

		<div class="points-summary">
			<span>Net from votes: <strong class:pos={t.vote_points >= 0} class:neg={t.vote_points < 0}>{t.vote_points >= 0 ? '+' : ''}{t.vote_points}</strong></span>
			<span>Net from sponsorship: <strong class:pos={t.sponsor_points >= 0} class:neg={t.sponsor_points < 0}>{t.sponsor_points >= 0 ? '+' : ''}{t.sponsor_points}</strong></span>
		</div>

		{#if breakdown.sponsorItems.length}
			<h4>Bills they sponsored</h4>
			<ul class="item-list">
				{#each breakdown.sponsorItems as item}
					<li>
						<span class="points {item.points >= 0 ? 'pos' : 'neg'}">{item.points >= 0 ? '+' : ''}{item.points}</span>
						<a href="/bills/{item.bill_id}"><span class="bill-num">{item.bill_number}</span> {item.title}</a>
						<span class="tag {item.alignment}">{item.sponsor_type === 1 ? 'Primary' : 'Co'} · {alignmentLabels[item.alignment]}</span>
					</li>
				{/each}
			</ul>
		{/if}

		<h4>Votes, ranked by impact on the score</h4>
		<ul class="item-list">
			{#each breakdown.items as item}
				{@const imp = getBillImpactTier(item.impact_tier)}
				<li>
					<span class="points {item.points >= 0 ? 'pos' : 'neg'}">{item.points >= 0 ? '+' : ''}{item.points}</span>
					<a href="/bills/{item.bill_id}"><span class="bill-num">{item.bill_number}</span> {item.title}</a>
					<span class="vote-tag">{voteText(item.vote_value)}</span>
					{#if imp}<span class="impact" title={imp.name}>{imp.emoji}</span>{/if}
					<span class="tag {item.alignment}">{alignmentLabels[item.alignment]}</span>
				</li>
			{/each}
		</ul>
		{#if breakdown.itemsTruncated > 0}
			<p class="truncated">+ {breakdown.itemsTruncated} more scored votes with smaller effect. Every one is in the full vote history below.</p>
		{/if}

		<p class="method-note">
			Points per vote = the bill's impact weight (Landmark 5× down to Ceremonial 0.25×), added for a
			vote that helps people, subtracted for one that helps capital. Not showing up costs a small
			penalty. Sponsoring a bill counts more than voting on it. The totals are normalized to 0–100.
		</p>
	</div>
</details>

<style>
	.breakdown {
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		margin-bottom: var(--space-xl);
	}
	summary {
		cursor: pointer;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: 2px;
		list-style: none;
	}
	summary::-webkit-details-marker { display: none; }
	summary::before {
		content: '▸';
		position: absolute;
		margin-left: -1rem;
		color: var(--color-text-dim);
	}
	details[open] summary::before { content: '▾'; }
	.summary-title {
		font-weight: 700;
		font-size: 0.9375rem;
	}
	.summary-hint {
		font-size: 0.75rem;
		color: var(--color-text-dim);
	}
	.breakdown-body {
		padding: 0 var(--space-md) var(--space-md);
		border-top: 1px solid var(--color-border);
	}
	.intro {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		line-height: 1.6;
		padding-top: var(--space-md);
	}
	.totals-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: var(--space-sm);
		margin: var(--space-md) 0;
	}
	.total-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: var(--space-sm);
		text-align: center;
	}
	.total-num {
		display: block;
		font-size: 1.25rem;
		font-weight: 800;
	}
	.total-label {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		line-height: 1.3;
	}
	.points-summary {
		display: flex;
		gap: var(--space-lg);
		flex-wrap: wrap;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-bottom: var(--space-md);
	}
	h4 {
		font-size: 0.875rem;
		margin: var(--space-md) 0 var(--space-sm);
	}
	.item-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 420px;
		overflow-y: auto;
	}
	.item-list li {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-size: 0.8125rem;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--color-border);
	}
	.item-list a {
		flex: 1;
		min-width: 0;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bill-num {
		font-weight: 700;
		color: var(--color-accent);
	}
	.points {
		flex-shrink: 0;
		min-width: 3rem;
		text-align: right;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.pos { color: var(--color-yea); }
	.neg { color: var(--color-nay); }
	.vote-tag, .tag {
		flex-shrink: 0;
		font-size: 0.6875rem;
		padding: 0.05rem 0.4rem;
		border-radius: 4px;
		white-space: nowrap;
	}
	.vote-tag {
		background: var(--color-bg-hover);
		color: var(--color-text-muted);
	}
	.tag.for_people { background: var(--color-yea); color: #fff; }
	.tag.for_capital { background: var(--color-nay); color: #fff; }
	.impact { flex-shrink: 0; font-size: 0.75rem; }
	.truncated, .method-note {
		font-size: 0.75rem;
		color: var(--color-text-dim);
		margin-top: var(--space-sm);
		line-height: 1.5;
	}
	.method-note {
		font-style: italic;
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-sm);
	}
	@media (max-width: 600px) {
		.item-list a { font-size: 0.75rem; }
	}
</style>
