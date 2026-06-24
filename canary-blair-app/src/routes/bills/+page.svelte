<script>
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/stores';
	import BillCard from '$lib/components/BillCard.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import Pagination from '$lib/components/Pagination.svelte';

	let { data } = $props();

	let search = $state(data.filters.search);
	let debounceTimer;

	function updateFilter(key, value) {
		const url = new URL($pageStore.url);
		url.searchParams.set(key, value);
		url.searchParams.set('page', '1');
		goto(url.toString(), { replaceState: true });
	}

	function handleSearch() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			updateFilter('q', search);
		}, 300);
	}

	function changePage(newPage) {
		const url = new URL($pageStore.url);
		url.searchParams.set('page', String(newPage));
		goto(url.toString(), { replaceState: true });
	}

	const statusOptions = [
		{ value: 'active', label: 'Active' },
		{ value: 'all', label: 'All' },
		{ value: 'passed', label: 'Passed' },
		{ value: 'vetoed', label: 'Vetoed' },
		{ value: 'failed', label: 'Failed' },
		{ value: 'dead', label: 'Dead' }
	];

	const chamberOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'H', label: 'House' },
		{ value: 'S', label: 'Senate' }
	];

	const alignmentOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'for_people', label: 'For People' },
		{ value: 'for_capital', label: 'For Capital' },
		{ value: 'neutral', label: 'Neutral' }
	];

	const impactOptions = [
		{ value: 'all', label: 'All' },
		{ value: '1', label: 'Landmark' },
		{ value: '2', label: 'High Impact' },
		{ value: '3', label: 'Meaningful' },
		{ value: '4', label: 'Routine' },
		{ value: '5', label: 'Minor' },
		{ value: '6', label: 'Ceremonial' }
	];
</script>

<svelte:head>
	<title>Bills — Canary Blair</title>
</svelte:head>

<div class="container">
	<h1>Bills</h1>
	<p class="subtitle">{data.totalCount.toLocaleString()} bills found</p>

	<div class="filters">
		<div class="filter-row">
			<div class="filter-group">
				{#each statusOptions as opt}
					<button
						class="filter-btn"
						class:active={data.filters.status === opt.value}
						onclick={() => updateFilter('status', opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
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
		</div>
		<div class="filter-row">
			<div class="filter-group">
				{#each alignmentOptions as opt}
					<button
						class="filter-btn"
						class:active={data.filters.alignment === opt.value}
						class:alignment-people={opt.value === 'for_people' && data.filters.alignment === 'for_people'}
						class:alignment-capital={opt.value === 'for_capital' && data.filters.alignment === 'for_capital'}
						onclick={() => updateFilter('alignment', opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
			<div class="filter-group">
				{#each impactOptions as opt}
					<button
						class="filter-btn"
						class:active={data.filters.impact === opt.value}
						onclick={() => updateFilter('impact', opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
		<SearchBar bind:value={search} placeholder="Search bills…" oninput={handleSearch} />
	</div>

	<div class="bill-list">
		{#each data.bills as bill (bill.id)}
			<BillCard {bill} />
		{:else}
			<p class="empty">No bills match your filters.</p>
		{/each}
	</div>

	<Pagination page={data.page} totalPages={data.totalPages} onchange={changePage} />
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
	.filter-btn.alignment-people {
		background: var(--color-yea);
		color: #fff;
	}
	.filter-btn.alignment-capital {
		background: var(--color-nay);
		color: #fff;
	}
	.bill-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}
	.empty {
		text-align: center;
		padding: var(--space-2xl);
		color: var(--color-text-dim);
	}
</style>
