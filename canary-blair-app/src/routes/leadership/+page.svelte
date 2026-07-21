<script>
	import PartyBadge from '$lib/components/PartyBadge.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>Leadership — Canary Blair</title>
	<meta name="description" content="West Virginia House and Senate leadership — Speaker, floor leaders, whips, and other chamber-wide roles." />
</svelte:head>

<div class="container">
	<h1>Leadership</h1>
	<p class="subtitle">
		Chamber-wide leadership roles — Speaker, floor leaders, whips. Committee chairs are shown on each
		<a href="/committees">committee's page</a> instead.
	</p>

	{#each [{ label: 'House of Delegates', rows: data.house }, { label: 'Senate', rows: data.senate }] as group}
		{#if group.rows.length > 0}
			<section class="chamber-section">
				<h2>{group.label}</h2>
				<div class="leader-list">
					{#each group.rows as m (m.id)}
						<a class="leader-row" href="/members/{m.id}">
							{#if m.photo_url}
								<img src={m.photo_url} alt={m.full_name} class="leader-photo" loading="lazy" />
							{:else}
								<div class="leader-photo placeholder-photo"><span>{m.full_name?.[0] || '?'}</span></div>
							{/if}
							<div class="leader-info">
								<div class="leader-title">{m.leadership_title}</div>
								<div class="leader-name-row">
									<PartyBadge party={m.party} />
									<span class="leader-name">{m.full_name}</span>
									{#if m.district}<span class="leader-district">District {m.district}</span>{/if}
								</div>
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}
	{/each}

	{#if data.house.length === 0 && data.senate.length === 0}
		<p class="empty">No leadership data yet.</p>
	{/if}
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle { color: var(--color-text-muted); font-size: 0.9375rem; line-height: 1.6; margin-bottom: var(--space-xl); }
	.empty { color: var(--color-text-dim); text-align: center; padding: var(--space-2xl) 0; }

	.chamber-section { margin-bottom: var(--space-xl); }
	.chamber-section h2 {
		margin-bottom: var(--space-md);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.leader-list { display: flex; flex-direction: column; gap: var(--space-sm); }
	.leader-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		color: var(--color-text);
	}
	.leader-row:hover { background: var(--color-bg-hover); text-decoration: none; }

	.leader-photo {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--color-bg-hover);
	}
	.placeholder-photo {
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: var(--color-text-dim);
		font-size: 1.25rem;
	}

	.leader-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.leader-title { font-weight: 700; color: var(--color-accent); font-size: 0.9375rem; }
	.leader-name-row { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; font-size: 0.875rem; }
	.leader-name { font-weight: 600; }
	.leader-district { color: var(--color-text-dim); font-size: 0.8125rem; }
</style>
