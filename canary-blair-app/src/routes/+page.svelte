<script>
	import DigestCard from '$lib/components/DigestCard.svelte';
	import BillCard from '$lib/components/BillCard.svelte';
	import { getTierData, scoreColor, formatDate } from '$lib/utils.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>Canary Blair — WV Legislative Accountability</title>
</svelte:head>

<div class="container">
	<section class="hero">
		<h1>Canary Blair</h1>
		<p class="tagline">
			Tracking every bill, every vote, every legislator in the West Virginia state government.
			Plain language. No accounts. No tracking. Free forever.
		</p>
	</section>

	{#if data.currentSession && !data.sessionActive}
		<div class="session-banner">
			<span aria-hidden="true">🕊️</span>
			{data.currentSession.name} has concluded.
			{#if data.lastVoteDate}Last floor vote was {formatDate(data.lastVoteDate)}.{/if}
			Bills below reflect how the session ended, not what's currently pending.
		</div>
	{/if}

	{#if data.digest}
		<section class="digest-section">
			<h2>Latest Update</h2>
			<DigestCard digest={data.digest} />
		</section>
	{/if}

	<section class="stats">
		<div class="stat-card">
			<span class="stat-number">{data.billCount.toLocaleString()}</span>
			<span class="stat-label">Bills Tracked</span>
		</div>
		<div class="stat-card">
			<span class="stat-number">{data.passedCount.toLocaleString()}</span>
			<span class="stat-label">Bills Passed</span>
		</div>
		<div class="stat-card">
			<span class="stat-number">{data.voteCount.toLocaleString()}</span>
			<span class="stat-label">Votes Recorded</span>
		</div>
	</section>

	<!-- Hall of Fame / Shame -->
	{#if data.topMembers.length > 0}
		<section class="leaderboard">
			<div class="board fame">
				<h2>Hall of Fame</h2>
				<p class="board-sub">Highest Canary Scores</p>
				{#each data.topMembers as m, i}
					{@const t = getTierData(m.canary_tier)}
					<a href="/members/{m.id}" class="board-row">
						<span class="board-rank">#{i + 1}</span>
						{#if m.photo_url}
							<img src={m.photo_url} alt={m.full_name} class="board-photo" loading="lazy" />
						{/if}
						<div class="board-circle {scoreColor(m.canary_score)}">
							<span>{m.canary_score}</span>
						</div>
						<div class="board-info">
							<span class="board-name">{m.full_name}</span>
							<span class="board-tier">{t?.emoji} {t?.name}</span>
						</div>
					</a>
				{/each}
			</div>
			<div class="board shame">
				<h2>Hall of Shame</h2>
				<p class="board-sub">Lowest Canary Scores</p>
				{#each data.bottomMembers as m, i}
					{@const t = getTierData(m.canary_tier)}
					<a href="/members/{m.id}" class="board-row">
						<span class="board-rank">#{i + 1}</span>
						{#if m.photo_url}
							<img src={m.photo_url} alt={m.full_name} class="board-photo" loading="lazy" />
						{/if}
						<div class="board-circle {scoreColor(m.canary_score)}">
							<span>{m.canary_score}</span>
						</div>
						<div class="board-info">
							<span class="board-name">{m.full_name}</span>
							<span class="board-tier">{t?.emoji} {t?.name}</span>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- The Graveyard callout — the story the scores can't tell -->
	<a href="/graveyard" class="graveyard-callout">
		<span class="gc-icon" aria-hidden="true">🪦</span>
		<span class="gc-text">
			<strong>Scores only measure the votes they were allowed to take.</strong>
			See the high-impact bills that would have helped West Virginians — killed in committee without a vote →
		</span>
	</a>

	<!-- Bills to Watch / Most Impactful Bills of the Session -->
	{#if data.peopleBills.length > 0 || data.capitalBills.length > 0}
		<section class="bills-watch">
			{#if data.sessionActive}
				<h2>Bills to Watch</h2>
				<p class="bills-watch-sub">The highest-impact active bills right now — what's at stake for West Virginia.</p>
			{:else}
				<h2>Most Impactful Bills{data.currentSession ? ` of the ${data.currentSession.year_start} Session` : ''}</h2>
				<p class="bills-watch-sub">The bills that mattered most this session, for better or worse — now decided.</p>
			{/if}
			<div class="bills-watch-grid">
				{#if data.peopleBills.length > 0}
					<div class="bills-watch-col">
						<h3 class="col-heading people-heading">For the People</h3>
						<div class="bills-watch-list">
							{#each data.peopleBills as bill (bill.id)}
								<BillCard {bill} />
							{/each}
						</div>
					</div>
				{/if}
				{#if data.capitalBills.length > 0}
					<div class="bills-watch-col">
						<h3 class="col-heading capital-heading">For Capital</h3>
						<div class="bills-watch-list">
							{#each data.capitalBills as bill (bill.id)}
								<BillCard {bill} />
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<section class="nav-cards">
		<a href="/bills" class="nav-card">
			<h3>Bills</h3>
			<p>Browse and search all bills in the current session</p>
		</a>
		<a href="/members" class="nav-card">
			<h3>Members</h3>
			<p>Every delegate and senator — scored, ranked, transparent</p>
		</a>
	</section>
</div>

<style>
	.hero {
		text-align: center;
		padding: var(--space-md) 0 var(--space-xl);
	}
	.hero h1 {
		font-size: 2.25rem;
		color: var(--color-accent);
		margin-bottom: var(--space-sm);
	}
	.tagline {
		max-width: 600px;
		margin: 0 auto;
		color: var(--color-text-muted);
		font-size: 1rem;
		line-height: 1.6;
	}

	.session-banner {
		margin-bottom: var(--space-lg);
		padding: var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-accent);
		border-radius: 8px;
		font-size: 0.9375rem;
		color: var(--color-text-muted);
		line-height: 1.6;
	}

	.digest-section {
		margin-bottom: var(--space-xl);
	}
	.digest-section h2 {
		margin-bottom: var(--space-md);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-md);
		margin-bottom: var(--space-xl);
	}
	.stat-card {
		text-align: center;
		padding: var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.stat-number {
		display: block;
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-accent);
	}
	.stat-label {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	/* Leaderboard */
	.leaderboard {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-lg);
		margin-bottom: var(--space-xl);
	}
	.board {
		padding: var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.board h2 {
		font-size: 1.125rem;
		margin-bottom: var(--space-xs);
	}
	.fame h2 { color: var(--color-score-excellent); }
	.shame h2 { color: var(--color-score-bad); }
	.board-sub {
		font-size: 0.75rem;
		color: var(--color-text-dim);
		margin-bottom: var(--space-md);
	}
	.board-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
		border-bottom: 1px solid var(--color-border);
		text-decoration: none;
		color: var(--color-text);
	}
	.board-row:last-child { border-bottom: none; }
	.board-row:hover { opacity: 0.85; }
	.board-rank {
		font-weight: 700;
		font-size: 0.8125rem;
		color: var(--color-text-dim);
		min-width: 1.5rem;
	}
	.board-photo {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
		object-position: center 15%;
		flex-shrink: 0;
		border: 2px solid var(--color-border);
	}
	.board-circle {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.board-circle span {
		font-weight: 800;
		font-size: 0.8125rem;
		color: #fff;
	}
	.score-excellent { background: var(--color-score-excellent); }
	.score-good { background: var(--color-score-good); }
	.score-neutral { background: var(--color-score-neutral); }
	.score-poor { background: var(--color-score-poor); }
	.score-bad { background: var(--color-score-bad); }
	.score-terrible { background: var(--color-score-terrible); }
	.score-unscored { background: var(--color-text-dim); }

	.board-info {
		display: flex;
		flex-direction: column;
	}
	.board-name {
		font-weight: 600;
		font-size: 0.875rem;
	}
	.board-tier {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.graveyard-callout {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md) var(--space-lg);
		margin-bottom: var(--space-xl);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-left: 4px solid var(--color-nay, #b85450);
		border-radius: 10px;
		color: var(--color-text);
	}
	.graveyard-callout:hover { background: var(--color-bg-hover); text-decoration: none; }
	.gc-icon { font-size: 2rem; flex-shrink: 0; }
	.gc-text { font-size: 0.9375rem; line-height: 1.6; color: var(--color-text-muted); }
	.gc-text strong { color: var(--color-text); }

	/* Bills to Watch */
	.bills-watch {
		margin-bottom: var(--space-xl);
	}
	.bills-watch h2 {
		margin-bottom: var(--space-xs);
	}
	.bills-watch-sub {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin-bottom: var(--space-lg);
	}
	.bills-watch-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-lg);
	}
	.col-heading {
		font-size: 1rem;
		margin-bottom: var(--space-md);
		padding-bottom: var(--space-xs);
		border-bottom: 2px solid;
	}
	.people-heading {
		color: var(--color-yea);
		border-color: var(--color-yea);
	}
	.capital-heading {
		color: var(--color-nay);
		border-color: var(--color-nay);
	}
	.bills-watch-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.nav-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: var(--space-md);
	}
	.nav-card {
		display: block;
		padding: var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		text-decoration: none;
		color: var(--color-text);
		transition: background 0.15s;
	}
	.nav-card:hover {
		background: var(--color-bg-hover);
		text-decoration: none;
	}
	.nav-card h3 {
		color: var(--color-accent);
		margin-bottom: var(--space-xs);
	}
	.nav-card p {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	@media (max-width: 600px) {
		.stats {
			grid-template-columns: 1fr;
		}
		.leaderboard {
			grid-template-columns: 1fr;
		}
		.bills-watch-grid {
			grid-template-columns: 1fr;
		}
		.hero h1 {
			font-size: 1.75rem;
		}
	}
</style>
