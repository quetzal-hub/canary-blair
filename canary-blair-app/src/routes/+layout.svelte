<script>
	import '../app.css';
	import { STATE_CONFIG } from '$stateConfig';

	let { children } = $props();
</script>

<div class="app">
	<a href="#main-content" class="skip-link">Skip to main content</a>
	<nav class="nav" aria-label="Primary">
		<div class="container nav-inner">
			<a href="/" class="nav-brand">
				<svg class="canary-icon" viewBox="0 0 440 420" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
					<ellipse cx="250" cy="320" rx="130" ry="100" fill="#c9a84c"/>
					<circle cx="320" cy="180" r="70" fill="#c9a84c"/>
					<polygon points="390,175 430,185 390,195" fill="#a08535"/>
					<circle cx="340" cy="170" r="8" fill="#1a1a1a"/>
					<ellipse cx="200" cy="290" rx="90" ry="60" fill="#a08535" transform="rotate(-15, 200, 290)"/>
					<polygon points="120,320 60,260 80,240 140,300" fill="#a08535"/>
					<line x1="220" y1="410" x2="210" y2="440" stroke="#a08535" stroke-width="8" stroke-linecap="round"/>
					<line x1="280" y1="410" x2="270" y2="440" stroke="#a08535" stroke-width="8" stroke-linecap="round"/>
				</svg>
				<span class="brand-text">Canary Blair</span>
			</a>
			<div class="nav-links">
				<a href="/find">Find Yours</a>
				<a href="/bills">Bills</a>
				<a href="/members">Members</a>
				<a href="/my-reps">My Reps</a>
				<a href="/about">About</a>
				<a href={STATE_CONFIG.voterRegistrationUrl} target="_blank" rel="noopener noreferrer" class="register-link">Register to Vote</a>
			</div>
		</div>
	</nav>

	<main class="main" id="main-content">
		{@render children()}
	</main>

	<footer class="footer">
		<div class="container">
			<a href="/about" class="footer-blair">
				<svg class="footer-canary" viewBox="0 0 440 420" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
					<ellipse cx="250" cy="320" rx="130" ry="100" fill="#c9a84c"/>
					<circle cx="320" cy="180" r="70" fill="#c9a84c"/>
					<polygon points="390,175 430,185 390,195" fill="#a08535"/>
					<circle cx="340" cy="170" r="8" fill="#1a1a1a"/>
					<ellipse cx="200" cy="290" rx="90" ry="60" fill="#a08535" transform="rotate(-15, 200, 290)"/>
					<polygon points="120,320 60,260 80,240 140,300" fill="#a08535"/>
				</svg>
				<span>Still watching. Still singing. Still fighting.</span>
			</a>
			<p class="footer-sub">
				Named for the canary and the mountain. Free forever. No tracking. No ads.
			</p>
			<nav class="footer-links" aria-label="More">
				<a href="/stats">Stats</a>
				<a href="/compare">Compare</a>
				<a href="/feeds">Feeds</a>
				<a href="/data">Open Data</a>
			</nav>
			<p class="footer-legal">
				Legislative data from <a href="https://legiscan.com/" target="_blank" rel="noopener noreferrer">LegiScan</a>.
				Canary Scores are calculated from the public record and AI bill classification, which is
				imperfect — every score links to the votes behind it.
				<a href="/feeds">RSS feeds</a>.
			</p>
		</div>
	</footer>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	.nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		height: var(--nav-height);
	}

	.nav-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 100%;
	}

	.nav-brand {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-weight: 700;
		font-size: 1.125rem;
		color: var(--color-accent);
		text-decoration: none;
	}

	.nav-brand:hover {
		text-decoration: none;
	}

	.canary-icon {
		width: 1.75rem;
		height: 1.75rem;
		flex-shrink: 0;
		position: relative;
		top: -0.2rem;
	}

	.nav-links {
		display: flex;
		gap: var(--space-lg);
	}

	.nav-links a {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		transition: color 0.15s;
	}

	.nav-links a:hover {
		color: var(--color-text);
		text-decoration: none;
	}

	.nav-links .register-link {
		color: var(--color-accent);
		font-weight: 600;
	}

	.nav-links .register-link:hover {
		color: var(--color-text);
	}

	.main {
		flex: 1;
		padding: var(--space-xl) 0;
	}

	.footer {
		border-top: 1px solid var(--color-border);
		padding: var(--space-lg) 0;
		text-align: center;
		font-size: 0.8125rem;
	}
	.footer-blair {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		color: var(--color-text-muted);
		text-decoration: none;
		font-weight: 500;
		font-style: italic;
		transition: color 0.15s;
	}
	.footer-blair:hover {
		color: var(--color-accent);
		text-decoration: none;
	}
	.footer-canary {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		position: relative;
		top: -0.1rem;
	}
	.footer-sub {
		margin-top: var(--space-xs);
		color: var(--color-text-dim);
		font-size: 0.75rem;
	}
	.footer-links {
		margin-top: var(--space-sm);
		display: flex;
		gap: var(--space-md);
		justify-content: center;
		flex-wrap: wrap;
	}
	.footer-links a {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 500;
	}
	.footer-legal {
		margin-top: var(--space-sm);
		color: var(--color-text-dim);
		font-size: 0.6875rem;
		line-height: 1.6;
		max-width: 640px;
		margin-left: auto;
		margin-right: auto;
	}
	.footer-legal a {
		color: var(--color-text-muted);
	}

	@media (max-width: 480px) {
		.brand-text {
			font-size: 0.95rem;
		}
		.nav-links {
			gap: var(--space-md);
		}
		.nav-links a {
			font-size: 0.8125rem;
		}
	}
</style>
