<script>
	import { partyColor } from '$lib/utils.js';

	let { party } = $props();
</script>

<span class="badge {partyColor(party)}">{party}</span>

<style>
	.badge {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 700;
		min-width: 1.5rem;
		text-align: center;
	}
	.party-d { background: var(--color-party-d); color: #fff; }
	.party-r { background: var(--color-party-r); color: #fff; }
	.party-i { background: var(--color-party-i); color: #fff; }
</style>
