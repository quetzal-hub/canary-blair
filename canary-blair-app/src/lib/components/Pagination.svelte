<script>
	let { page = 1, totalPages = 1, onchange } = $props();

	function prev() {
		if (page > 1) onchange(page - 1);
	}
	function next() {
		if (page < totalPages) onchange(page + 1);
	}
</script>

{#if totalPages > 1}
	<div class="pagination">
		<button onclick={prev} disabled={page <= 1}>← Prev</button>
		<span class="page-info">Page {page} of {totalPages}</span>
		<button onclick={next} disabled={page >= totalPages}>Next →</button>
	</div>
{/if}

<style>
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-md);
		padding: var(--space-lg) 0;
	}
	button {
		padding: 0.375rem 0.75rem;
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.8125rem;
	}
	button:hover:not(:disabled) {
		background: var(--color-bg-hover);
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.page-info {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
</style>
