<script>
	let { value = $bindable(''), placeholder = 'Search…', oninput } = $props();
</script>

<div class="search-bar">
	<input
		type="search"
		bind:value
		{placeholder}
		aria-label={placeholder}
		{oninput}
	/>
</div>

<style>
	.search-bar {
		width: 100%;
	}
	input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
	}
	input::placeholder {
		color: var(--color-text-dim);
	}
	input:focus-visible {
		border-color: var(--color-accent);
	}
</style>
