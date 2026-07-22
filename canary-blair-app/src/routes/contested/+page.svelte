<script>
	let { data } = $props();
</script>

<svelte:head>
	<title>The Votes That Mattered — Canary Blair</title>
	<meta
		name="description"
		content="Strip away the hundreds of near-unanimous consensus votes and you're left with the handful that actually divided the West Virginia legislature — the votes where legislators showed their hand."
	/>
</svelte:head>

<div class="container">
	<h1>The Votes That Mattered</h1>
	<p class="subtitle">
		Of the <strong>{data.totalPassageVotes}</strong> final passage votes this session on bills with a clear
		people-or-capital stake, only <strong>{data.contested.length}</strong> were genuinely contested — where
		at least a quarter of the chamber broke ranks. On everything else, the outcome was never in doubt.
		<strong>That's the tell.</strong> By the time a consequential bill reached an up-or-down vote, the real
		decision had already been made — in the committees where good bills
		<a href="/graveyard">quietly died</a>, and in the <a href="/theater">consensus machine</a> that makes a
		record look benevolent. Here are the few times the chamber actually had to show its hand.
	</p>

	<div class="summary">
		<div class="sum-col win">
			<span class="sum-num">{data.peopleWins}</span>
			<span class="sum-label">the people's side won</span>
		</div>
		<div class="sum-col loss">
			<span class="sum-num">{data.peopleLosses}</span>
			<span class="sum-label">the people's side lost</span>
		</div>
	</div>

	{#if data.contested.length === 0}
		<p class="empty">No contested votes found yet — bills may not be classified.</p>
	{:else}
		<p class="hint">Closest votes first. On each, "the people's side" means yea on a pro-people bill, or nay on a pro-capital one.</p>
		<div class="vote-list">
			{#each data.contested as v (v.bill_id)}
				<a class="vote-row" href="/bills/{v.bill_id}">
					<div class="vote-split" class:won={v.peopleWon} class:lost={!v.peopleWon}>
						<span class="split-nums">{v.yea}–{v.nay}</span>
						<span class="split-outcome">{v.peopleWon ? 'people won' : 'people lost'}</span>
					</div>
					<div class="vote-bill">
						<div class="vote-line1">
							<span class="align-tag {v.alignment === 'for_people' ? 'people' : 'capital'}">{v.alignment === 'for_people' ? 'For People' : 'For Capital'}</span>
							{#if v.impact_tier <= 2}<span class="impact-tag">{v.impact_tier === 1 ? 'LANDMARK' : 'HIGH IMPACT'}</span>{/if}
							<span class="vote-num">{v.bill_number}</span>
							{#if v.chamber}<span class="chamber-mini">{v.chamber === 'H' ? 'House' : 'Senate'}</span>{/if}
						</div>
						<span class="vote-title">{v.title}</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}

	<p class="footnote">
		"Contested" = the winning side took 75% or less (at least a quarter of the voting chamber dissented), on
		a passage vote for a bill our AI classified as clearly for the people or for capital. Amendment and
		procedural votes are excluded because their direction can't be read without the amendment text. These
		divided votes are exactly the ones the Canary Score now weights most heavily. See
		<a href="/about">the methodology</a>.
	</p>
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle { color: var(--color-text-muted); font-size: 1rem; line-height: 1.7; margin-bottom: var(--space-lg); max-width: 720px; }
	.subtitle strong { color: var(--color-text); }

	.summary { display: flex; gap: var(--space-md); margin-bottom: var(--space-xl); }
	.sum-col { flex: 1; text-align: center; padding: var(--space-lg); border-radius: 12px; border: 1px solid var(--color-border); background: var(--color-bg-raised); }
	.sum-col.win { border-bottom: 4px solid var(--color-yea, #5b8c5a); }
	.sum-col.loss { border-bottom: 4px solid var(--color-nay, #b85450); }
	.sum-num { display: block; font-size: 2.5rem; font-weight: 800; line-height: 1; }
	.win .sum-num { color: var(--color-yea, #5b8c5a); }
	.loss .sum-num { color: var(--color-nay, #b85450); }
	.sum-label { font-size: 0.875rem; color: var(--color-text-muted); }

	.hint { font-size: 0.8125rem; color: var(--color-text-dim); margin-bottom: var(--space-md); }
	.empty { color: var(--color-text-dim); text-align: center; padding: var(--space-2xl) 0; }

	.vote-list { display: flex; flex-direction: column; gap: var(--space-xs); }
	.vote-row {
		display: flex; align-items: stretch; gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		background: var(--color-bg-raised); border: 1px solid var(--color-border); border-radius: 8px;
		color: var(--color-text);
	}
	.vote-row:hover { background: var(--color-bg-hover); text-decoration: none; }
	.vote-split { flex-shrink: 0; width: 88px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 6px; padding: var(--space-xs); }
	.vote-split.won { background: color-mix(in srgb, var(--color-yea, #5b8c5a) 15%, transparent); }
	.vote-split.lost { background: color-mix(in srgb, var(--color-nay, #b85450) 15%, transparent); }
	.split-nums { font-weight: 800; font-size: 1.0625rem; font-variant-numeric: tabular-nums; }
	.split-outcome { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 700; }
	.won .split-outcome { color: var(--color-yea, #5b8c5a); }
	.lost .split-outcome { color: var(--color-nay, #b85450); }
	.vote-bill { min-width: 0; display: flex; flex-direction: column; gap: 3px; justify-content: center; }
	.vote-line1 { display: flex; align-items: center; gap: var(--space-xs); flex-wrap: wrap; }
	.align-tag { font-size: 0.6875rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 4px; }
	.align-tag.people { background: color-mix(in srgb, var(--color-yea, #5b8c5a) 20%, transparent); color: var(--color-yea, #5b8c5a); }
	.align-tag.capital { background: color-mix(in srgb, var(--color-nay, #b85450) 20%, transparent); color: var(--color-nay, #b85450); }
	.impact-tag { font-size: 0.625rem; font-weight: 800; letter-spacing: 0.02em; color: var(--color-text-dim); }
	.vote-num { font-weight: 700; font-size: 0.8125rem; }
	.chamber-mini { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-text-dim); font-weight: 700; }
	.vote-title { font-size: 0.875rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.footnote { font-size: 0.8125rem; color: var(--color-text-dim); line-height: 1.7; margin-top: var(--space-xl); padding-top: var(--space-md); border-top: 1px solid var(--color-border); max-width: 720px; }
</style>
