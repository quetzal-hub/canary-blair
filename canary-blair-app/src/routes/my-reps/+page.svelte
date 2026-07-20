<script>
	import { supabase } from '$lib/supabase.js';
	import { myReps } from '$lib/myreps.js';
	import MemberCard from '$lib/components/MemberCard.svelte';

	let members = $state([]);
	let loading = $state(true);

	// Re-fetch current data whenever the pinned set changes. Runs client-side
	// only — the pinned IDs live in localStorage, never on our server.
	$effect(() => {
		const ids = $myReps;
		loading = true;
		if (ids.length === 0) {
			members = [];
			loading = false;
			return;
		}
		supabase
			.from('members')
			.select('id, full_name, party, chamber, district, photo_url, canary_score, canary_tier, canary_badges, canary_votes_scored, next_election, is_current')
			.in('id', ids)
			.then(({ data }) => {
				// Preserve the order the user pinned them in.
				const byId = new Map((data || []).map((m) => [m.id, m]));
				members = ids.map((id) => byId.get(id)).filter(Boolean);
				loading = false;
			});
	});
</script>

<svelte:head>
	<title>My Reps — Canary Blair</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container">
	<h1>My Reps</h1>
	<p class="subtitle">
		Legislators you've saved, kept only in this browser. Nothing is sent to us — clear your browser
		data and this list is gone. Save reps from the <a href="/find">Find Yours</a> page or any member's profile.
	</p>

	{#if loading}
		<p class="state">Loading…</p>
	{:else if members.length === 0}
		<div class="empty">
			<p>You haven't saved any legislators yet.</p>
			<a class="cta" href="/find">Find your representatives →</a>
		</div>
	{:else}
		<div class="member-grid">
			{#each members as member (member.id)}
				<MemberCard {member} showPin />
			{/each}
		</div>
	{/if}
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.subtitle { color: var(--color-text-muted); font-size: 0.9375rem; line-height: 1.6; margin-bottom: var(--space-xl); }
	.state { color: var(--color-text-dim); }
	.empty { text-align: center; padding: var(--space-2xl) 0; color: var(--color-text-dim); }
	.empty .cta { display: inline-block; margin-top: var(--space-md); font-weight: 600; }
	.member-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--space-md);
	}
</style>
