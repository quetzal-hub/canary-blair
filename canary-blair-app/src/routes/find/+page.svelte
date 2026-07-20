<script>
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/stores';
	import MemberCard from '$lib/components/MemberCard.svelte';
	import { STATE_CONFIG } from '$stateConfig';

	let { data } = $props();

	let city = $state($pageStore.url.searchParams.get('city') || '');
	let zip = $state($pageStore.url.searchParams.get('zip') || '');
	let street = $state($pageStore.url.searchParams.get('street') || '');
	let searching = $state(false);

	async function handleSubmit(e) {
		e.preventDefault();
		if (!city && !zip) return;
		searching = true;
		const params = new URLSearchParams();
		if (street) params.set('street', street);
		if (city) params.set('city', city);
		if (zip) params.set('zip', zip);
		await goto(`/find?${params}`, { invalidateAll: true });
		searching = false;
	}
</script>

<svelte:head>
	<title>Find Your Legislators — Canary Blair</title>
</svelte:head>

<div class="container">
	<h1>Find Your Legislators</h1>
	<p class="subtitle">Enter your {STATE_CONFIG.name} address to see who represents you — and how they vote.</p>

	<form class="address-form" onsubmit={handleSubmit}>
		<div class="form-row">
			<div class="form-field">
				<label for="street">Street Address <span class="optional">(optional, for exact results)</span></label>
				<input id="street" type="text" bind:value={street} placeholder="123 Main St" />
			</div>
		</div>
		<div class="form-row">
			<div class="form-field">
				<label for="city">City</label>
				<input id="city" type="text" bind:value={city} placeholder="Charleston" />
			</div>
			<div class="form-field zip-field">
				<label for="zip">Zip Code</label>
				<input id="zip" type="text" bind:value={zip} placeholder="25301" maxlength="5" />
			</div>
			<button type="submit" class="submit-btn" disabled={searching || (!city && !zip)}>
				{searching ? 'Looking up…' : 'Find'}
			</button>
		</div>
	</form>

	{#if data.error}
		<div class="error-msg">{data.error}</div>
	{/if}

	{#if data.members}
		{#if data.address}
			<div class="result-header">
				<p class="matched-address">{data.address}</p>
				<div class="district-labels">
					{#if data.houseDistrict}
						<span class="district-badge">🏛️ {data.houseDistrict}</span>
					{/if}
					{#if data.senateDistrict}
						<span class="district-badge">🏛️ {data.senateDistrict}</span>
					{/if}
				</div>
				{#if data.approximate}
					<p class="approximate-warning">
						⚠️ Cities and zip codes can span multiple districts. These results are based on the area center and may not be exact. Enter your street address above for a guaranteed match.
					</p>
				{/if}
			</div>
		{/if}

		{#if data.members.length > 0}
			<h2>Your Representatives</h2>
			<div class="member-list">
				{#each data.members as member (member.id)}
					<MemberCard {member} />
				{/each}
			</div>
		{:else}
			<p class="empty">No legislators found for this location. This may be a data issue — try adding your street address for a more precise lookup.</p>
		{/if}
	{/if}

	{#if !data.members && !data.error}
		<div class="hint">
			<p>A city or zip code will get you started, but cities and zip codes can span multiple districts. For a guaranteed exact match, include your street address.</p>
			<p>Nothing is stored or tracked. We use the U.S. Census Bureau to find your districts.</p>
		</div>
	{/if}
</div>

<style>
	h1 {
		margin-bottom: var(--space-xs);
	}
	.subtitle {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		margin-bottom: var(--space-xl);
		line-height: 1.5;
	}

	.address-form {
		margin-bottom: var(--space-xl);
	}
	.form-row {
		display: flex;
		gap: var(--space-md);
		align-items: flex-end;
		margin-bottom: var(--space-md);
	}
	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		flex: 1;
	}
	.zip-field {
		max-width: 120px;
	}
	label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-muted);
	}
	.optional {
		font-weight: 400;
		color: var(--color-text-dim);
	}
	input {
		padding: 0.625rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.9375rem;
		background: var(--color-bg-raised);
		color: var(--color-text);
	}
	input:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: -1px;
	}
	.submit-btn {
		padding: 0.625rem 1.5rem;
		background: var(--color-accent);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-weight: 600;
		font-size: 0.9375rem;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.submit-btn:hover:not(:disabled) {
		opacity: 0.9;
	}
	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error-msg {
		padding: var(--space-md);
		background: var(--color-nay);
		color: #fff;
		border-radius: 8px;
		margin-bottom: var(--space-lg);
		font-size: 0.875rem;
	}

	.result-header {
		margin-bottom: var(--space-lg);
		padding: var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.matched-address {
		font-weight: 600;
		margin-bottom: var(--space-sm);
	}
	.district-labels {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}
	.district-badge {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	.approximate-warning {
		margin-top: var(--space-sm);
		font-size: 0.8125rem;
		color: var(--color-score-poor, #c57b1a);
		font-weight: 500;
		line-height: 1.5;
	}

	h2 {
		margin-bottom: var(--space-md);
	}
	.member-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.empty {
		text-align: center;
		padding: var(--space-2xl);
		color: var(--color-text-dim);
	}

	.hint {
		padding: var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		line-height: 1.6;
	}
	.hint p:last-child {
		margin-bottom: 0;
		font-style: italic;
		color: var(--color-text-dim);
		margin-top: var(--space-sm);
	}

	@media (max-width: 600px) {
		.form-row {
			flex-direction: column;
			align-items: stretch;
		}
		.zip-field {
			max-width: none;
		}
		.submit-btn {
			width: 100%;
			padding: 0.75rem;
		}
	}
</style>
