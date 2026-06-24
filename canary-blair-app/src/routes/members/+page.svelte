<script>
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/stores';
	import MemberCard from '$lib/components/MemberCard.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';

	let { data } = $props();

	let search = $state(data.filters.search);
	let debounceTimer;

	function updateFilter(key, value) {
		const url = new URL($pageStore.url);
		url.searchParams.set(key, value);
		goto(url.toString(), { replaceState: true });
	}

	function handleSearch() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			updateFilter('q', search);
		}, 300);
	}

	const chamberOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'H', label: 'House' },
		{ value: 'S', label: 'Senate' }
	];

	const partyOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'D', label: 'Democrat' },
		{ value: 'R', label: 'Republican' }
	];

	const sortOptions = [
		{ value: 'score', label: 'Score (High)' },
		{ value: 'score-asc', label: 'Score (Low)' },
		{ value: 'name', label: 'Name' }
	];

	const tierOptions = [
		{ value: 'all', label: 'All Tiers' },
		{ value: '1', label: '✨ Mountaineer' },
		{ value: '2', label: '🌱 Friend of the Holler' },
		{ value: '3', label: '🌫️ Weathervane' },
		{ value: '4', label: '🪨 Company Man' },
		{ value: '5', label: '🐀 Rat in the Capitol' },
		{ value: '6', label: '☠️ Owned' }
	];
</script>

<svelte:head>
	<title>Members — Canary Blair</title>
</svelte:head>

<div class="container">
	<h1>Members</h1>
	<p class="subtitle">{data.members.length} legislators — sorted by Canary Score</p>

	<div class="filters">
		<div class="filter-row">
			<div class="filter-group">
				{#each chamberOptions as opt}
					<button
						class="filter-btn"
						class:active={data.filters.chamber === opt.value}
						onclick={() => updateFilter('chamber', opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
			<div class="filter-group">
				{#each partyOptions as opt}
					<button
						class="filter-btn"
						class:active={data.filters.party === opt.value}
						onclick={() => updateFilter('party', opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
			<div class="filter-group">
				{#each sortOptions as opt}
					<button
						class="filter-btn"
						class:active={data.filters.sort === opt.value}
						onclick={() => updateFilter('sort', opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
		<div class="filter-row">
			<select class="tier-select" onchange={(e) => updateFilter('tier', e.target.value)} value={data.filters.tier}>
				{#each tierOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			<SearchBar bind:value={search} placeholder="Search by name or district..." oninput={handleSearch} />
		</div>
	</div>

	<div class="member-grid">
		{#each data.members as member (member.id)}
			<MemberCard {member} />
		{:else}
			<p class="empty">No members match your filters.</p>
		{/each}
	</div>
</div>

<style>
	h1 {
		margin-bottom: var(--space-xs);
	}
	.subtitle {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin-bottom: var(--space-lg);
	}
	.filters {
		margin-bottom: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}
	.filter-row {
		display: flex;
		gap: var(--space-md);
		flex-wrap: wrap;
		align-items: center;
	}
	.filter-group {
		display: flex;
		gap: 2px;
		background: var(--color-bg-raised);
		border-radius: 6px;
		border: 1px solid var(--color-border);
		overflow: hidden;
	}
	.filter-btn {
		padding: 0.375rem 0.75rem;
		background: transparent;
		border: none;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 500;
	}
	.filter-btn:hover {
		background: var(--color-bg-hover);
		color: var(--color-text);
	}
	.filter-btn.active {
		background: var(--color-accent-dim);
		color: #fff;
	}
	.tier-select {
		padding: 0.375rem 0.75rem;
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.8125rem;
	}
	.member-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--space-md);
	}
	.empty {
		text-align: center;
		padding: var(--space-2xl);
		color: var(--color-text-dim);
		grid-column: 1 / -1;
	}
</style>
