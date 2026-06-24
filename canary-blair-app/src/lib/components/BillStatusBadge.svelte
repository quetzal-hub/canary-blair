<script>
	import { statusLabel, statusColor } from '$lib/utils.js';

	let { status } = $props();
</script>

<span class="badge {statusColor(status)}">{statusLabel(status)}</span>

<style>
	.badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}
	.status-introduced { background: var(--color-status-introduced); color: #fff; }
	.status-engrossed { background: var(--color-status-engrossed); color: #1a1a1a; }
	.status-enrolled { background: var(--color-status-enrolled); color: #fff; }
	.status-passed { background: var(--color-status-passed); color: #fff; }
	.status-vetoed { background: var(--color-status-vetoed); color: #1a1a1a; }
	.status-failed { background: var(--color-status-failed); color: #fff; }
</style>
