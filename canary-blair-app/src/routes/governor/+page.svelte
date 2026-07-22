<script>
	import { getTierData, scoreColor } from '$lib/utils.js';

	let { data } = $props();
	const gov = data.governor;
	const tier = $derived(getTierData(gov.canary_tier));
	const t = $derived(data.breakdown?.totals || {});

	const ACTION_LABELS = {
		signed: 'Signed',
		vetoed: 'Vetoed',
		no_signature: 'Became law without signature'
	};
</script>

<svelte:head>
	<title>Governor {gov.full_name} — Canary Blair</title>
	<meta
		name="description"
		content={gov.canary_score != null
			? `Governor ${gov.full_name}: Canary Score ${gov.canary_score}/100. Every bill signed and vetoed, scored.`
			: `Governor ${gov.full_name}'s record on Canary Blair.`}
	/>
</svelte:head>

<div class="container">
	<header class="gov-header">
		{#if gov.photo_url}
			<img src={gov.photo_url} alt={gov.full_name} class="gov-portrait" />
		{:else}
			<div class="gov-portrait placeholder-portrait"><span>{gov.full_name?.[0] || '?'}</span></div>
		{/if}
		<div>
			<div class="gov-meta">
				<span class="gov-office">Governor of West Virginia</span>
				{#if gov.party}<span class="sep">·</span><span>{gov.party === 'R' ? 'Republican' : gov.party === 'D' ? 'Democrat' : gov.party}</span>{/if}
				{#if gov.term_start}<span class="sep">·</span><span>Took office {gov.term_start}</span>{/if}
				{#if gov.next_election}<span class="sep">·</span><span class="election-year">Up in {gov.next_election}</span>{/if}
			</div>
			<h1>{gov.full_name}</h1>
		</div>
	</header>

	{#if gov.canary_score != null && tier}
		<section class="score-hero">
			<div class="score-circle {scoreColor(gov.canary_score)}">
				<span class="score-number">{gov.canary_score}</span>
			</div>
			<div class="score-text">
				<div class="tier-name">{tier.emoji} {tier.name.toUpperCase()}</div>
				<div class="tier-tagline">"{tier.tagline}"</div>
				<div class="score-sub">
					Canary Score: {gov.canary_score} / 100 · calculated from {t.actions_scored || 0} scored bill actions
				</div>
			</div>
		</section>
		<p class="methodology-note">
			This score is a mathematical product of the Governor's own actions on bills — signing, vetoing, or
			letting them become law unsigned — using the same AI bill classifications as legislator scores.
			It is not an editorial judgment, and AI classification is imperfect; the full action list below
			shows every scored decision. Letting a bill become law without a signature counts at half strength:
			acquiescence, not endorsement.
		</p>

		<section class="action-stats">
			<div class="stat-card"><span class="stat-number">{t.signed_total || 0}</span><span class="stat-label">Bills signed</span></div>
			<div class="stat-card"><span class="stat-number">{t.vetoed_total || 0}</span><span class="stat-label">Bills vetoed</span></div>
			<div class="stat-card"><span class="stat-number">{t.no_signature_total || 0}</span><span class="stat-label">Became law unsigned</span></div>
		</section>
		<p class="scored-note">
			Of {t.actions_total || 0} total bill actions, {t.actions_scored || 0} were on bills our AI classified as
			clearly for the people or for capital — only those move the score. The rest were procedural or
			administrative bills with no clear lean.
		</p>

		{#if data.breakdown?.items?.length}
			<section class="section">
				<h2>How we got this number</h2>
				<p class="breakdown-sub">Every scored action, biggest impact first. Positive points helped the score; negative hurt it.</p>
				<div class="action-list">
					{#each data.breakdown.items as item}
						<a class="action-row" href="/bills/{item.bill_id}">
							<span class="action-what {item.action}">{ACTION_LABELS[item.action] || item.action}</span>
							<div class="action-bill">
								<span class="action-number">{item.bill_number}</span>
								<span class="action-title">{item.title}</span>
							</div>
							<span class="action-align {item.alignment === 'for_people' ? 'people' : 'capital'}">{item.alignment === 'for_people' ? 'For People' : 'For Capital'}</span>
							<span class="action-points {item.points >= 0 ? 'pos' : 'neg'}">{item.points >= 0 ? '+' : ''}{item.points}</span>
						</a>
					{/each}
				</div>
				{#if data.breakdown.itemsTruncated > 0}
					<p class="truncated-note">…and {data.breakdown.itemsTruncated} more scored actions folded into the total.</p>
				{/if}
			</section>
		{/if}
	{:else}
		<p class="empty">The Governor's score hasn't been calculated yet.</p>
	{/if}

	{#if gov.finance_total_raised != null}
		<section class="section">
			<h2>Who funds the Governor</h2>
			<div class="finance">
				<span class="finance-amount">${gov.finance_total_raised.toLocaleString()}</span>
				<span class="finance-label">in total campaign contributions</span>
			</div>
			<p class="finance-note">
				Source: <a href={gov.finance_source_url} target="_blank" rel="noopener noreferrer">FollowTheMoney</a>.
				Context, not part of the score.
			</p>
		</section>
	{/if}

	<section class="section">
		<h2>More</h2>
		<p class="more-links">
			<a href={gov.website} target="_blank" rel="noopener noreferrer">Official Governor's site</a>
			<span class="sep">·</span>
			<a href="/officials">All statewide officials</a>
		</p>
	</section>
</div>

<style>
	.gov-header { display: flex; align-items: center; gap: var(--space-lg); margin-bottom: var(--space-xl); }
	.gov-portrait { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; background: var(--color-bg-hover); flex-shrink: 0; }
	.placeholder-portrait { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 2rem; color: var(--color-text-dim); }
	.gov-meta { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: var(--space-xs); }
	.gov-office { font-weight: 600; }
	.sep { color: var(--color-text-dim); }
	.election-year { color: var(--color-accent); font-weight: 600; }

	.score-hero {
		display: flex; align-items: center; gap: var(--space-lg);
		padding: var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		margin-bottom: var(--space-md);
	}
	.score-circle {
		width: 88px; height: 88px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0; color: #fff;
	}
	.score-circle.score-excellent { background: var(--color-score-excellent); }
	.score-circle.score-good { background: var(--color-score-good); }
	.score-circle.score-neutral { background: var(--color-score-neutral); }
	.score-circle.score-poor { background: var(--color-score-poor); }
	.score-circle.score-bad { background: var(--color-score-bad); }
	.score-circle.score-terrible { background: var(--color-score-terrible); }
	.score-number { font-size: 2rem; font-weight: 800; }
	.tier-name { font-weight: 800; color: var(--color-accent); letter-spacing: 0.02em; }
	.tier-tagline { font-style: italic; color: var(--color-text-muted); margin: 2px 0; }
	.score-sub { font-size: 0.8125rem; color: var(--color-text-dim); }

	.methodology-note { font-size: 0.8125rem; color: var(--color-text-dim); line-height: 1.6; margin-bottom: var(--space-lg); }

	.action-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-md); margin-bottom: var(--space-sm); }
	.scored-note { font-size: 0.8125rem; color: var(--color-text-dim); line-height: 1.6; margin-bottom: var(--space-xl); }
	.stat-card { text-align: center; padding: var(--space-md); background: var(--color-bg-raised); border: 1px solid var(--color-border); border-radius: 8px; display: flex; flex-direction: column; gap: 4px; }
	.stat-number { font-size: 1.5rem; font-weight: 800; color: var(--color-accent); }
	.stat-label { font-size: 0.8125rem; color: var(--color-text-muted); }

	.section { margin-bottom: var(--space-xl); }
	.section h2 { margin-bottom: var(--space-sm); padding-bottom: var(--space-sm); border-bottom: 1px solid var(--color-border); }
	.breakdown-sub { font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: var(--space-md); }

	.action-list { display: flex; flex-direction: column; gap: var(--space-xs); }
	.action-row {
		display: flex; align-items: center; gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		background: var(--color-bg-raised); border: 1px solid var(--color-border); border-radius: 8px;
		color: var(--color-text); font-size: 0.875rem;
	}
	.action-row:hover { background: var(--color-bg-hover); text-decoration: none; }
	.action-what { font-weight: 700; flex-shrink: 0; width: 80px; }
	.action-what.vetoed { color: var(--color-nay, #a03c3c); }
	.action-what.signed { color: var(--color-yea, #4a7c3f); }
	.action-what.no_signature { color: var(--color-text-muted); font-size: 0.75rem; }
	.action-bill { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.action-number { font-weight: 600; }
	.action-title { color: var(--color-text-muted); font-size: 0.8125rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.action-align { font-size: 0.75rem; font-weight: 600; flex-shrink: 0; }
	.action-align.people { color: var(--color-yea, #4a7c3f); }
	.action-align.capital { color: var(--color-nay, #a03c3c); }
	.action-points { font-weight: 800; font-variant-numeric: tabular-nums; flex-shrink: 0; width: 48px; text-align: right; }
	.action-points.pos { color: var(--color-yea, #4a7c3f); }
	.action-points.neg { color: var(--color-nay, #a03c3c); }
	.truncated-note { font-size: 0.8125rem; color: var(--color-text-dim); margin-top: var(--space-sm); }

	.empty { color: var(--color-text-dim); text-align: center; padding: var(--space-2xl) 0; }
	.finance { display: flex; align-items: baseline; gap: var(--space-sm); flex-wrap: wrap; padding: var(--space-md) 0; }
	.finance-amount { font-size: 2rem; font-weight: 800; color: var(--color-accent); }
	.finance-label { color: var(--color-text-muted); font-size: 0.9375rem; }
	.finance-note { font-size: 0.8125rem; color: var(--color-text-dim); }
	.more-links { font-size: 0.9375rem; }

	@media (max-width: 560px) {
		.gov-header { flex-direction: column; text-align: center; }
		.gov-meta { justify-content: center; }
		.score-hero { flex-direction: column; text-align: center; }
	}
</style>
