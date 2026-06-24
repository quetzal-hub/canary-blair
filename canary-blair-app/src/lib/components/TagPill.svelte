<script>
	let { tag } = $props();
</script>

<span class="tag">{tag}</span>

<style>
	.tag {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 500;
		background: var(--color-bg-hover);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
	}
</style>
