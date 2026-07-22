<script>
	let { data } = $props();
</script>

<svelte:head>
	<title>The Graveyard — Canary Blair</title>
	<meta
		name="description"
		content="High-impact bills that would have helped West Virginians — killed in committee without a single recorded vote. The story the scores can't tell."
	/>
</svelte:head>

<div class="container">
	<h1>🪦 The Graveyard</h1>
	<p class="subtitle">
		A legislator's Canary Score can only measure the bills they were <em>allowed</em> to vote on. But the
		most consequential decisions of a session are the ones that never reached the floor — high-impact bills
		that would have helped West Virginians, quietly killed in committee without a single recorded vote, so
		no one's name is ever attached to their death.
	</p>

	<div class="headline-stat">
		<span class="big-number">{data.totalDead}</span>
		<span class="big-label">
			high-impact, people-first bills died in committee without a vote{#if data.landmarkDead > 0}, including
			{data.landmarkDead} classified as <strong>landmark</strong>{/if}.
		</span>
	</div>

	<p class="context">
		These are bills our AI classified as <strong>for the people</strong> and either <strong>Landmark</strong>
		or <strong>High Impact</strong> — the kind of legislation that shapes whether West Virginia stays last in
		the metrics that matter. Each one was referred to a committee and left to die there. The committees that
		buried the most are listed first.
	</p>

	{#each data.committees as c (c.committee)}
		<section class="committee-graveyard">
			<div class="committee-head">
				<div class="committee-title">
					<h2>
						{#if c.committee_id}<a href="/committees/{c.committee_id}">{c.committee}</a>{:else}{c.committee}{/if}
						<span class="chamber-tag">{c.chamber === 'H' ? 'House' : 'Senate'}</span>
					</h2>
					{#if c.chair}
						<div class="chair-line">
							Chair:
							{#if c.chair.member_id}<a href="/members/{c.chair.member_id}">{c.chair.name}</a>{:else}{c.chair.name}{/if}
							— controls what this committee votes on
						</div>
					{/if}
				</div>
				<span class="died-count">{c.bills.length} buried</span>
			</div>
			<div class="bill-list">
				{#each c.bills as b (b.id)}
					<a class="dead-bill" href="/bills/{b.id}">
						<span class="tier-tag tier-{b.ai_impact_tier}">{b.ai_impact_tier === 1 ? 'LANDMARK' : 'HIGH IMPACT'}</span>
						<div class="bill-text">
							<span class="bill-number">{b.bill_number}</span>
							<span class="bill-title">{b.title}</span>
							{#if b.ai_who_benefits}<span class="who-benefits">Would have helped: {b.ai_who_benefits}</span>{/if}
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/each}

	{#if data.committees.length === 0}
		<p class="empty">No high-impact people-first bills died without a vote this session — or the bill data hasn't been classified yet.</p>
	{/if}

	<p class="footnote">
		"Died without a vote" means the bill never appeared in any recorded roll call — it was referred to
		committee and never brought back out. Impact tier and alignment are AI classifications; see the
		<a href="/about">methodology</a>. A bill dying in committee isn't proof of bad faith on its own — bills
		die for many reasons — but the <em>pattern</em> of which bills get buried, and where, is the clearest
		picture of a legislature's real priorities.
	</p>
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle { color: var(--color-text-muted); font-size: 1rem; line-height: 1.7; margin-bottom: var(--space-lg); max-width: 720px; }

	.headline-stat {
		display: flex; align-items: baseline; gap: var(--space-md);
		padding: var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-left: 4px solid var(--color-nay, #b85450);
		border-radius: 10px;
		margin-bottom: var(--space-md);
		flex-wrap: wrap;
	}
	.big-number { font-size: 3rem; font-weight: 800; color: var(--color-nay, #b85450); line-height: 1; }
	.big-label { font-size: 1rem; color: var(--color-text-muted); line-height: 1.6; flex: 1; min-width: 220px; }

	.context { font-size: 0.9375rem; color: var(--color-text-muted); line-height: 1.7; margin-bottom: var(--space-xl); max-width: 720px; }

	.committee-graveyard { margin-bottom: var(--space-xl); }
	.committee-head {
		display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-md);
		margin-bottom: var(--space-sm); padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border);
	}
	.committee-head h2 { font-size: 1.125rem; }
	.committee-title { min-width: 0; }
	.chamber-tag { font-size: 0.6875rem; font-weight: 700; color: var(--color-text-dim); text-transform: uppercase; letter-spacing: 0.03em; margin-left: var(--space-xs); }
	.chair-line { font-size: 0.8125rem; color: var(--color-text-muted); margin-top: 2px; }
	.died-count { font-size: 0.8125rem; color: var(--color-nay, #b85450); font-weight: 700; white-space: nowrap; }

	.bill-list { display: flex; flex-direction: column; gap: var(--space-xs); }
	.dead-bill {
		display: flex; align-items: flex-start; gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		color: var(--color-text);
	}
	.dead-bill:hover { background: var(--color-bg-hover); text-decoration: none; }
	.tier-tag { font-size: 0.6875rem; font-weight: 800; letter-spacing: 0.03em; padding: 0.2rem 0.4rem; border-radius: 4px; flex-shrink: 0; white-space: nowrap; margin-top: 2px; }
	.tier-1 { background: var(--color-score-terrible, #8b2520); color: #fff; }
	.tier-2 { background: var(--color-score-bad, #b85450); color: #fff; }
	.bill-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.bill-number { font-weight: 700; font-size: 0.8125rem; }
	.bill-title { font-size: 0.9375rem; }
	.who-benefits { font-size: 0.8125rem; color: var(--color-text-dim); line-height: 1.5; margin-top: 2px; }

	.empty { color: var(--color-text-dim); text-align: center; padding: var(--space-2xl) 0; }
	.footnote { font-size: 0.8125rem; color: var(--color-text-dim); line-height: 1.7; margin-top: var(--space-xl); padding-top: var(--space-md); border-top: 1px solid var(--color-border); max-width: 720px; }
</style>
