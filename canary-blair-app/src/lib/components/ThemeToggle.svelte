<script>
	import { onMount } from 'svelte';

	const KEY = 'canary-blair:theme';
	const order = ['auto', 'light', 'dark'];
	const labels = { auto: '🖥️ Auto', light: '☀️ Light', dark: '🌙 Dark' };

	let theme = $state('auto');

	onMount(() => {
		try {
			theme = localStorage.getItem(KEY) || 'auto';
		} catch {
			theme = 'auto';
		}
	});

	function cycle() {
		theme = order[(order.indexOf(theme) + 1) % order.length];
		try {
			const root = document.documentElement;
			if (theme === 'auto') {
				localStorage.removeItem(KEY);
				root.removeAttribute('data-theme');
			} else {
				localStorage.setItem(KEY, theme);
				root.setAttribute('data-theme', theme);
			}
		} catch {
			// localStorage unavailable — theme just won't persist
		}
	}
</script>

<button class="theme-toggle" onclick={cycle} aria-label="Theme: {theme}. Click to change theme.">
	{labels[theme]}
</button>

<style>
	.theme-toggle {
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 0.2rem 0.7rem;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.theme-toggle:hover {
		color: var(--color-text);
		border-color: var(--color-accent);
	}
</style>
