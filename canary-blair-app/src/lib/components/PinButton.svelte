<script>
	import { myReps } from '$lib/myreps.js';

	let { memberId, memberName = 'this legislator', compact = false } = $props();

	const pinned = $derived($myReps.includes(memberId));
</script>

<button
	class="pin"
	class:pinned
	onclick={(e) => {
		e.preventDefault();
		e.stopPropagation();
		myReps.toggle(memberId);
	}}
	aria-pressed={pinned}
	aria-label={pinned ? `Remove ${memberName} from My Reps` : `Save ${memberName} to My Reps`}
	title={pinned ? 'Saved to My Reps' : 'Save to My Reps'}
>
	<span aria-hidden="true">{pinned ? '★' : '☆'}</span>
	{#if !compact}<span class="label">{pinned ? 'Saved' : 'Save'}</span>{/if}
</button>

<style>
	.pin {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 0.2rem 0.6rem;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.pin:hover {
		color: var(--color-text);
		border-color: var(--color-accent);
	}
	.pin.pinned {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}
</style>
