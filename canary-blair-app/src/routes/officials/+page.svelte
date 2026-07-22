<script>
	import PartyBadge from '$lib/components/PartyBadge.svelte';
	import { scoreColor } from '$lib/utils.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>Statewide Officials — Canary Blair</title>
	<meta name="description" content="West Virginia's statewide elected officials — the executive branch and the elected Supreme Court of Appeals, with campaign finance where available." />
</svelte:head>

<div class="container">
	<h1>Statewide Officials</h1>
	<p class="subtitle">
		The legislature writes the bills — these are the people who sign them, enforce them, and rule on them.
		All of them are elected by West Virginians.
	</p>

	{#if data.executive.length > 0}
		<section class="group">
			<h2>Executive Branch</h2>
			<div class="official-list">
				{#each data.executive as o (o.slug)}
					{@const isGov = o.slug === 'governor'}
					<svelte:element
						this={isGov ? 'a' : o.website ? 'a' : 'div'}
						class="official-row"
						href={isGov ? '/governor' : o.website}
						target={isGov ? undefined : '_blank'}
						rel={isGov ? undefined : 'noopener noreferrer'}
					>
						{#if o.photo_url}
							<img src={o.photo_url} alt={o.full_name} class="official-photo" loading="lazy" />
						{:else}
							<div class="official-photo placeholder-photo"><span>{o.full_name?.[0] || '?'}</span></div>
						{/if}
						<div class="official-info">
							<div class="official-office">{o.office}</div>
							<div class="official-name-row">
								{#if o.party}<PartyBadge party={o.party} />{/if}
								<span class="official-name">{o.full_name}</span>
								{#if o.next_election}<span class="official-election">Up in {o.next_election}</span>{/if}
							</div>
						</div>
						{#if isGov && o.canary_score != null}
							<div class="score-chip {scoreColor(o.canary_score)}">{o.canary_score}</div>
						{:else if isGov}
							<span class="gov-link-hint">Score & record →</span>
						{/if}
					</svelte:element>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.judicial.length > 0}
		<section class="group">
			<h2>Supreme Court of Appeals</h2>
			<p class="group-note">
				West Virginia elects its Supreme Court justices — which means campaign money reaches the bench
				too. We display who funds judicial campaigns as attributed fact; we do not score judicial
				decisions, ever.
			</p>
			<div class="official-list">
				{#each data.judicial as o (o.slug)}
					<div class="official-row">
						{#if o.photo_url}
							<img src={o.photo_url} alt={o.full_name} class="official-photo" loading="lazy" />
						{:else}
							<div class="official-photo placeholder-photo"><span>{o.full_name?.[0] || '?'}</span></div>
						{/if}
						<div class="official-info">
							<div class="official-office">{o.office}</div>
							<div class="official-name-row">
								<span class="official-name">{o.full_name}</span>
							</div>
							{#if o.finance_total_raised != null}
								<div class="official-finance">
									${o.finance_total_raised.toLocaleString()} raised ·
									<a href={o.finance_source_url} target="_blank" rel="noopener noreferrer">FollowTheMoney</a>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.executive.length === 0 && data.judicial.length === 0}
		<p class="empty">No officials data yet.</p>
	{/if}
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle { color: var(--color-text-muted); font-size: 0.9375rem; line-height: 1.6; margin-bottom: var(--space-xl); }
	.empty { color: var(--color-text-dim); text-align: center; padding: var(--space-2xl) 0; }

	.group { margin-bottom: var(--space-xl); }
	.group h2 { margin-bottom: var(--space-md); padding-bottom: var(--space-sm); border-bottom: 1px solid var(--color-border); }
	.group-note { font-size: 0.875rem; color: var(--color-text-muted); line-height: 1.6; margin-bottom: var(--space-md); }

	.official-list { display: flex; flex-direction: column; gap: var(--space-sm); }
	.official-row {
		display: flex; align-items: center; gap: var(--space-md);
		padding: var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		color: var(--color-text);
	}
	a.official-row:hover { background: var(--color-bg-hover); text-decoration: none; }

	.official-photo { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: var(--color-bg-hover); }
	.placeholder-photo { display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--color-text-dim); font-size: 1.25rem; }

	.official-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
	.official-office { font-weight: 700; color: var(--color-accent); font-size: 0.875rem; }
	.official-name-row { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
	.official-name { font-weight: 600; }
	.official-election { color: var(--color-text-dim); font-size: 0.8125rem; }
	.official-finance { font-size: 0.8125rem; color: var(--color-text-muted); }

	.score-chip {
		width: 48px; height: 48px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-weight: 800; color: #fff; flex-shrink: 0;
	}
	.score-chip.score-excellent { background: var(--color-score-excellent); }
	.score-chip.score-good { background: var(--color-score-good); }
	.score-chip.score-neutral { background: var(--color-score-neutral); }
	.score-chip.score-poor { background: var(--color-score-poor); }
	.score-chip.score-bad { background: var(--color-score-bad); }
	.score-chip.score-terrible { background: var(--color-score-terrible); }
	.gov-link-hint { font-size: 0.8125rem; color: var(--color-text-dim); flex-shrink: 0; }
</style>
