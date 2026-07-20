<script>
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/stores';
	import PartyBadge from '$lib/components/PartyBadge.svelte';
	import { chamberLabel, partyLabel, getTierData, getBadgeData, scoreColor } from '$lib/utils.js';

	let { data } = $props();

	function pick(slot, id) {
		const url = new URL($pageStore.url);
		if (id) url.searchParams.set(slot, id);
		else url.searchParams.delete(slot);
		goto(url.toString(), { replaceState: true });
	}

	const columns = $derived([
		{ slot: 'a', selected: data.aId, member: data.a },
		{ slot: 'b', selected: data.bId, member: data.b }
	]);
</script>

<svelte:head>
	<title>Compare Legislators — Canary Blair</title>
</svelte:head>

<div class="container">
	<h1>Compare Legislators</h1>
	<p class="subtitle">Put two records side by side.</p>

	<div class="cols">
		{#each columns as col (col.slot)}
			<div class="col">
				<select
					aria-label="Choose a legislator to compare"
					value={col.selected || ''}
					onchange={(e) => pick(col.slot, e.target.value)}
				>
					<option value="">Choose a legislator…</option>
					{#each data.allMembers as m}
						<option value={m.id}>{m.full_name} ({m.party}, {chamberLabel(m.chamber)})</option>
					{/each}
				</select>

				{#if col.member}
					{@const m = col.member}
					{@const tier = getTierData(m.canary_tier)}
					<div class="card">
						{#if m.photo_url}
							<img src={m.photo_url} alt={m.full_name} class="photo" />
						{:else}
							<div class="photo placeholder">{m.full_name?.[0] || '?'}</div>
						{/if}
						<h2><a href="/members/{m.id}">{m.full_name}</a></h2>
						<div class="meta">
							<PartyBadge party={m.party} />
							<span>{partyLabel(m.party)} · {chamberLabel(m.chamber)}{m.district ? ` · Dist ${m.district}` : ''}</span>
						</div>

						{#if m.canary_score != null && tier}
							<div class="score {scoreColor(m.canary_score)}">
								<span class="num" aria-hidden="true">{m.canary_score}</span>
								<span class="sr-only">Canary Score {m.canary_score} out of 100</span>
							</div>
							<div class="tier">{tier.name}</div>
						{:else}
							<div class="score score-unscored"><span class="num" aria-hidden="true">–</span></div>
							<div class="tier">Unscored</div>
						{/if}

						<dl class="stats">
							<div><dt>Scored votes</dt><dd>{m.canary_votes_scored ?? 0}</dd></div>
							{#if m.summary}
								<div><dt>Total votes</dt><dd>{m.summary.total_votes ?? '—'}</dd></div>
								<div><dt>Yea</dt><dd>{m.summary.yea_count ?? '—'}</dd></div>
								<div><dt>Nay</dt><dd>{m.summary.nay_count ?? '—'}</dd></div>
							{/if}
						</dl>

						{#if m.canary_badges?.length}
							<div class="badges">
								{#each m.canary_badges as badge}
									{@const b = getBadgeData(badge)}
									{#if b}<span class="badge"><span aria-hidden="true">{b.emoji}</span> {b.name}</span>{/if}
								{/each}
							</div>
						{/if}

						{#if m.ai_profile_summary}
							<p class="profile">{m.ai_profile_summary}</p>
						{/if}
					</div>
				{:else}
					<div class="card empty">Pick a legislator to compare.</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle { color: var(--color-text-muted); margin-bottom: var(--space-xl); }
	.cols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); }
	select {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-text);
		margin-bottom: var(--space-md);
	}
	.card {
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: var(--space-lg);
		text-align: center;
	}
	.card.empty { color: var(--color-text-dim); padding: var(--space-2xl) var(--space-lg); }
	.photo {
		width: 80px; height: 80px; border-radius: 50%; object-fit: cover; object-position: center 15%;
		margin: 0 auto var(--space-sm); border: 2px solid var(--color-border);
	}
	.photo.placeholder {
		display: flex; align-items: center; justify-content: center;
		background: var(--color-bg-hover); color: var(--color-text-dim); font-weight: 700; font-size: 1.75rem;
	}
	.card h2 { font-size: 1.125rem; margin-bottom: var(--space-xs); }
	.meta { display: flex; align-items: center; justify-content: center; gap: var(--space-sm); font-size: 0.8125rem; color: var(--color-text-muted); margin-bottom: var(--space-md); }
	.score {
		width: 72px; height: 72px; border-radius: 50%; margin: 0 auto var(--space-xs);
		display: flex; align-items: center; justify-content: center;
	}
	.num { font-size: 1.75rem; font-weight: 800; color: #fff; }
	.score-good .num, .score-neutral .num, .score-poor .num { color: #1a1a1a; }
	.score-excellent { background: var(--color-score-excellent); }
	.score-good { background: var(--color-score-good); }
	.score-neutral { background: var(--color-score-neutral); }
	.score-poor { background: var(--color-score-poor); }
	.score-bad { background: var(--color-score-bad); }
	.score-terrible { background: var(--color-score-terrible); }
	.score-unscored { background: var(--color-text-dim); }
	.tier { font-weight: 600; margin-bottom: var(--space-md); }
	.stats { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-xs); text-align: left; margin-bottom: var(--space-md); }
	.stats dt { font-size: 0.75rem; color: var(--color-text-dim); }
	.stats dd { font-weight: 700; font-size: 0.9375rem; }
	.badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-bottom: var(--space-md); }
	.badge { font-size: 0.6875rem; padding: 0.1rem 0.5rem; background: var(--color-bg-hover); border: 1px solid var(--color-border); border-radius: 9999px; color: var(--color-text-muted); }
	.profile { font-size: 0.8125rem; color: var(--color-text-muted); line-height: 1.6; text-align: left; }
	@media (max-width: 600px) {
		.cols { grid-template-columns: 1fr; }
	}
</style>
