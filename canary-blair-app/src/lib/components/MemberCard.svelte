<script>
	import PartyBadge from './PartyBadge.svelte';
	import { chamberLabel, getTierData, getBadgeData, scoreColor } from '$lib/utils.js';

	let { member } = $props();

	const tier = $derived(getTierData(member.canary_tier));
</script>

<a href="/members/{member.member_id || member.id}" class="member-card">
	<div class="card-top">
		{#if member.photo_url}
			<img src={member.photo_url} alt={member.full_name} class="member-photo" loading="lazy" />
		{:else}
			<div class="member-photo placeholder-photo">
				<span>{member.full_name?.[0] || '?'}</span>
			</div>
		{/if}
		<div class="member-info-col">
			<div class="member-header">
				<PartyBadge party={member.party} />
				<span class="member-name">{member.full_name}</span>
			</div>
			<div class="member-info">
				<span>{chamberLabel(member.chamber)}</span>
				{#if member.district}
					<span>District {member.district}</span>
				{/if}
				{#if member.next_election}
					<span class="election-tag">Up in {member.next_election}</span>
				{/if}
			</div>
		</div>
		{#if member.canary_score != null}
			<div class="score-col {scoreColor(member.canary_score)}">
				<span class="score-number">{member.canary_score}</span>
			</div>
		{:else}
			<div class="score-col score-unscored">
				<span class="score-number">-</span>
			</div>
		{/if}
	</div>
	{#if tier}
		<div class="tier-row {tier.cssClass}">
			<span class="tier-emoji">{tier.emoji}</span>
			<span class="tier-name">{tier.name}</span>
		</div>
	{:else}
		<div class="tier-row tier-unscored">
			<span class="tier-emoji">🥚</span>
			<span class="tier-name">Unscored</span>
		</div>
	{/if}
	{#if member.canary_badges?.length}
		<div class="badges-row">
			{#each member.canary_badges as badge}
				{@const b = getBadgeData(badge)}
				{#if b}
					<span class="badge-pill" title={b.desc}>{b.emoji} {b.name}</span>
				{/if}
			{/each}
		</div>
	{/if}
</a>

<style>
	.member-card {
		display: block;
		padding: var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		text-decoration: none;
		color: var(--color-text);
		transition: background 0.15s;
	}
	.member-card:hover {
		background: var(--color-bg-hover);
		text-decoration: none;
	}
	.card-top {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}
	.member-photo {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		object-position: center 15%;
		flex-shrink: 0;
		border: 2px solid var(--color-border);
	}
	.placeholder-photo {
		background: var(--color-bg-hover);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-dim);
		font-weight: 700;
		font-size: 1.125rem;
	}
	.member-info-col {
		flex: 1;
		min-width: 0;
	}
	.member-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-xs);
	}
	.member-name {
		font-weight: 600;
		font-size: 0.9375rem;
	}
	.member-info {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		display: flex;
		gap: var(--space-sm);
	}
	.election-tag {
		color: var(--color-accent);
		font-weight: 600;
	}
	.score-col {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.score-number {
		font-weight: 800;
		font-size: 1.125rem;
		color: #fff;
	}
	.score-excellent { background: var(--color-score-excellent); }
	.score-good { background: var(--color-score-good); }
	.score-neutral { background: var(--color-score-neutral); }
	.score-poor { background: var(--color-score-poor); }
	.score-bad { background: var(--color-score-bad); }
	.score-terrible { background: var(--color-score-terrible); }
	.score-unscored { background: var(--color-text-dim); }

	.tier-row {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.8125rem;
		margin-bottom: var(--space-sm);
	}
	.tier-emoji { font-size: 0.875rem; }
	.tier-name { font-weight: 500; }
	.tier-1 .tier-name { color: var(--color-score-excellent); }
	.tier-2 .tier-name { color: var(--color-score-good); }
	.tier-3 .tier-name { color: var(--color-score-neutral); }
	.tier-4 .tier-name { color: var(--color-score-poor); }
	.tier-5 .tier-name { color: var(--color-score-bad); }
	.tier-6 .tier-name { color: var(--color-score-terrible); }
	.tier-unscored .tier-name { color: var(--color-text-dim); }

	.badges-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.badge-pill {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		background: var(--color-bg-hover);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		white-space: nowrap;
	}
</style>
