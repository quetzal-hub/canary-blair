<script>
	import { partyLabel, chamberLabel, getTierData, scoreColor } from '$lib/utils.js';

	let { data } = $props();

	const maxTier = $derived(Math.max(1, ...Object.values(data.tierCounts)));
</script>

<svelte:head>
	<title>Statewide Stats — Canary Blair</title>
</svelte:head>

<div class="container">
	<h1>Statewide Stats</h1>
	<p class="subtitle">How the whole legislature scores, at a glance. Sitting members only.</p>

	<section class="overall">
		<div class="big-score {scoreColor(data.overall)}">
			<span aria-hidden="true">{data.overall ?? '–'}</span>
			<span class="sr-only">Average Canary Score {data.overall ?? 'not available'}</span>
		</div>
		<div>
			<div class="big-label">Average Canary Score</div>
			<div class="big-sub">{data.scoredCount} scored of {data.totalCount} sitting legislators</div>
		</div>
	</section>

	<div class="grid">
		<section class="panel">
			<h2>By party</h2>
			{#each data.byParty as row}
				<div class="bar-row">
					<span class="bar-label">{partyLabel(row.value)} <span class="dim">({row.count})</span></span>
					<div class="bar-track">
						<div class="bar-fill {scoreColor(row.avg)}" style="width: {row.avg ?? 0}%"></div>
					</div>
					<span class="bar-val">{row.avg ?? '–'}</span>
				</div>
			{/each}
		</section>

		<section class="panel">
			<h2>By chamber</h2>
			{#each data.byChamber as row}
				<div class="bar-row">
					<span class="bar-label">{chamberLabel(row.value)} <span class="dim">({row.count})</span></span>
					<div class="bar-track">
						<div class="bar-fill {scoreColor(row.avg)}" style="width: {row.avg ?? 0}%"></div>
					</div>
					<span class="bar-val">{row.avg ?? '–'}</span>
				</div>
			{/each}
		</section>
	</div>

	<section class="panel">
		<h2>Tier distribution</h2>
		<div class="tiers">
			{#each [1, 2, 3, 4, 5, 6] as t}
				{@const tier = getTierData(t)}
				{@const count = data.tierCounts[t]}
				<a class="tier-row" href="/members?tier={t}">
					<span class="tier-name"><span aria-hidden="true">{tier.emoji}</span> {tier.name}</span>
					<div class="tier-track">
						<div class="tier-fill score-{['excellent', 'good', 'neutral', 'poor', 'bad', 'terrible'][t - 1]}" style="width: {(count / maxTier) * 100}%"></div>
					</div>
					<span class="tier-count">{count}</span>
				</a>
			{/each}
		</div>
	</section>

	<p class="note">Averages exclude the {data.unscored} legislators with fewer than 20 scored votes. <a href="/data">Download the full data →</a></p>
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle { color: var(--color-text-muted); margin-bottom: var(--space-xl); }
	.overall {
		display: flex; align-items: center; gap: var(--space-lg);
		padding: var(--space-lg); background: var(--color-bg-raised);
		border: 1px solid var(--color-border); border-radius: 12px; margin-bottom: var(--space-lg);
	}
	.big-score {
		width: 88px; height: 88px; border-radius: 50%; flex-shrink: 0;
		display: flex; align-items: center; justify-content: center;
		font-size: 2.25rem; font-weight: 800; color: #fff;
	}
	.big-score.score-good, .big-score.score-neutral, .big-score.score-poor { color: #1a1a1a; }
	.big-label { font-size: 1.125rem; font-weight: 700; }
	.big-sub { color: var(--color-text-muted); font-size: 0.875rem; }
	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); margin-bottom: var(--space-lg); }
	.panel {
		padding: var(--space-lg); background: var(--color-bg-raised);
		border: 1px solid var(--color-border); border-radius: 12px; margin-bottom: var(--space-lg);
	}
	.panel h2 { font-size: 1rem; margin-bottom: var(--space-md); }
	.bar-row { display: grid; grid-template-columns: 7rem 1fr 2rem; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-sm); }
	.bar-label { font-size: 0.8125rem; }
	.dim { color: var(--color-text-dim); }
	.bar-track, .tier-track { background: var(--color-bg); border-radius: 9999px; height: 10px; overflow: hidden; }
	.bar-fill, .tier-fill { height: 100%; border-radius: 9999px; }
	.bar-val, .tier-count { font-weight: 700; font-size: 0.875rem; text-align: right; }
	.score-excellent { background: var(--color-score-excellent); }
	.score-good { background: var(--color-score-good); }
	.score-neutral { background: var(--color-score-neutral); }
	.score-poor { background: var(--color-score-poor); }
	.score-bad { background: var(--color-score-bad); }
	.score-terrible { background: var(--color-score-terrible); }
	.tiers { display: flex; flex-direction: column; gap: var(--space-sm); }
	.tier-row { display: grid; grid-template-columns: 12rem 1fr 2rem; align-items: center; gap: var(--space-sm); color: var(--color-text); }
	.tier-row:hover { text-decoration: none; }
	.tier-row:hover .tier-name { color: var(--color-accent); }
	.tier-name { font-size: 0.8125rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.note { font-size: 0.8125rem; color: var(--color-text-dim); }
	@media (max-width: 600px) {
		.grid { grid-template-columns: 1fr; }
		.tier-row { grid-template-columns: 9rem 1fr 2rem; }
	}
</style>
