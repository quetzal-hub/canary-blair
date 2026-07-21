<script>
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/stores';
	import PartyBadge from '$lib/components/PartyBadge.svelte';
	import BillStatusBadge from '$lib/components/BillStatusBadge.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ScoreBreakdown from '$lib/components/ScoreBreakdown.svelte';
	import ScoreHistory from '$lib/components/ScoreHistory.svelte';
	import PinButton from '$lib/components/PinButton.svelte';
	import { chamberLabel, partyLabel, voteColor, getTierData, getBadgeData, getBillImpactTier, scoreColor, effectiveAlignment, effectiveImpactTier, isReviewed } from '$lib/utils.js';

	const alignmentLabels = {
		for_people: { label: 'For People', cssClass: 'alignment-people' },
		for_capital: { label: 'For Capital', cssClass: 'alignment-capital' },
		neutral: { label: 'Neutral', cssClass: 'alignment-neutral' }
	};

	let { data } = $props();
	const member = data.member;

	const tier = $derived(getTierData(member.canary_tier));

	const age = $derived.by(() => {
		if (!member.birth_date) return null;
		const birth = new Date(member.birth_date);
		const now = new Date();
		let years = now.getFullYear() - birth.getFullYear();
		const beforeBirthday = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
		if (beforeBirthday) years--;
		return years;
	});

	const shareDesc = $derived(
		member.canary_score != null && tier
			? `Canary Score ${member.canary_score}/100 — ${tier.name}. See how ${member.full_name} actually votes.`
			: `${member.full_name}'s voting record on Canary Blair.`
	);

	// Prewritten, editable message for contacting the legislator.
	const contactBody = $derived(
		`Dear ${member.full_name},\n\nAs a constituent, I'm writing about your voting record. ` +
			`I've been following it on Canary Blair and I'd like to know more about how you're representing our district.\n\nThank you,`
	);

	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText($pageStore.url.href);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	function changeVotePage(newPage) {
		const url = new URL($pageStore.url);
		url.searchParams.set('vp', String(newPage));
		goto(url.toString(), { replaceState: true });
	}
</script>

<svelte:head>
	<title>{member.full_name} — Canary Blair</title>
	<meta name="description" content={shareDesc} />
	<meta property="og:title" content="{member.full_name} — Canary Blair" />
	<meta property="og:description" content={shareDesc} />
	<meta property="og:type" content="profile" />
	<meta name="twitter:card" content="summary" />
	<link rel="alternate" type="application/rss+xml" title="{member.full_name} — every vote" href="/feeds/member/{member.id}.xml" />
</svelte:head>

<div class="container">
	<a href="/members" class="back-link">← Back to members</a>

	<header class="member-header">
		<div class="header-top">
			{#if member.photo_url}
				<img src={member.photo_url} alt={member.full_name} class="member-portrait" />
			{:else}
				<div class="member-portrait placeholder-portrait">
					<span>{member.full_name?.[0] || '?'}</span>
				</div>
			{/if}
			<div class="header-text">
				<div class="member-meta">
					<PartyBadge party={member.party} />
					<span class="party-label">{partyLabel(member.party)}</span>
					<span class="sep">·</span>
					<span>{chamberLabel(member.chamber)}</span>
					{#if member.district}
						<span class="sep">·</span>
						<span>District {member.district}</span>
					{/if}
					{#if age}
						<span class="sep">·</span>
						<span>Age {age}</span>
					{/if}
					{#if member.is_current === false}
						<span class="sep">·</span>
						<span class="former-year">Former legislator</span>
					{:else if member.next_election}
						<span class="sep">·</span>
						<span class="election-year">Up in {member.next_election}</span>
					{/if}
				</div>
				<h1>{member.full_name}</h1>
				{#if member.leadership_title}
					<div class="leadership-tag">🏛️ {member.leadership_title}</div>
				{/if}
				<div class="header-actions">
					<PinButton memberId={member.id} memberName={member.full_name} />
					<button class="share-btn" onclick={copyLink}>
						<span aria-hidden="true">🔗</span> {copied ? 'Link copied' : 'Share'}
					</button>
				</div>
			</div>
		</div>
	</header>

	<!-- Canary Score -->
	<section class="section score-section">
		{#if member.canary_score != null && tier}
			<div class="score-hero {tier.cssClass}">
				<div
					class="score-circle {scoreColor(member.canary_score)}"
					role="img"
					aria-label="Canary Score {member.canary_score} out of 100, tier {tier.name}"
				>
					<span class="score-big" aria-hidden="true">{member.canary_score}</span>
				</div>
				<div class="score-details">
					<div class="tier-label"><span aria-hidden="true">{tier.emoji}</span> {tier.name.toUpperCase()}</div>
					<div class="tier-tagline">"{tier.tagline}"</div>
					<div class="score-meta">Canary Score: {member.canary_score} / 100 · calculated from {member.canary_votes_scored} scored votes</div>
				</div>
			</div>
		{:else}
			<div class="score-hero tier-unscored">
				<div class="score-circle score-unscored">
					<span class="score-big">?</span>
				</div>
				<div class="score-details">
					<div class="tier-label">🥚 UNSCORED</div>
					<div class="tier-tagline">"Not enough data yet. Watch this space."</div>
					<div class="score-meta">Fewer than 20 scored votes on tagged bills.</div>
				</div>
			</div>
		{/if}
		{#if member.canary_score != null}
			<p class="score-disclaimer">
				This score is a mathematical product of {member.full_name}'s own voting and sponsorship record,
				classified by AI. It is not an editorial judgment, and AI classification is imperfect — expand
				the breakdown below to check every vote yourself.
				{#if data.breakdown.anyReviewed}<span class="reviewed-note"> ✏️ Some bills in this score were manually reviewed and corrected.</span>{/if}
			</p>
		{/if}
	</section>

	{#if member.canary_score != null}
		<ScoreHistory history={data.scoreHistory} />
		<ScoreBreakdown breakdown={data.breakdown} memberName={member.full_name} />
	{/if}

	<!-- Who funds them -->
	{#if member.finance_total_raised != null}
		<section class="section">
			<h2>Who funds {member.full_name}</h2>
			<div class="finance">
				<span class="finance-amount">${member.finance_total_raised.toLocaleString()}</span>
				<span class="finance-label">in total campaign contributions</span>
			</div>

			{#if member.finance_contrib_types?.length || member.finance_small_donor_total != null}
				<div class="finance-split">
					{#each member.finance_contrib_types || [] as t}
						<div class="finance-split-item">
							<span class="finance-split-amount">${(t.total || 0).toLocaleString()}</span>
							<span class="finance-split-label">
								{t.type === 'Individual' ? 'from individuals' : t.type === 'Non-Individual' ? 'from organizations & PACs' : 'other / unitemized'}
							</span>
						</div>
					{/each}
					{#if member.finance_small_donor_total != null}
						<div class="finance-split-item">
							<span class="finance-split-amount">${member.finance_small_donor_total.toLocaleString()}</span>
							<span class="finance-split-label">from small donations ($200 or less)</span>
						</div>
					{/if}
				</div>
			{/if}

			{#if member.finance_top_industries?.length}
				<h3 class="finance-subhead">Top industries funding them</h3>
				<ul class="finance-list">
					{#each member.finance_top_industries.slice(0, 6) as ind}
						<li>
							<span class="finance-list-name">{ind.industry}</span>
							{#if ind.sector && ind.sector !== ind.industry}<span class="finance-list-sector">{ind.sector}</span>{/if}
							<span class="finance-list-amount">${(ind.total || 0).toLocaleString()}</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if member.finance_top_donors?.length}
				<h3 class="finance-subhead">Largest contributors</h3>
				<ul class="finance-list">
					{#each member.finance_top_donors.slice(0, 6) as donor}
						<li>
							<span class="finance-list-name">{donor.name}</span>
							{#if donor.type}<span class="finance-list-sector">{donor.type === 'Non-Individual' ? 'organization' : donor.type.toLowerCase()}</span>{/if}
							<span class="finance-list-amount">${(donor.total || 0).toLocaleString()}</span>
						</li>
					{/each}
				</ul>
			{/if}

			<p class="finance-note">
				Source: <a href={member.finance_source_url} target="_blank" rel="noopener noreferrer">FollowTheMoney</a>{member.finance_matched_by === 'name' ? ' (matched by name — approximate)' : ''}.
				This is context, <strong>not</strong> part of the Canary Score — the score is math on votes and
				sponsorship only. We show it so you can decide for yourself whether the money and the votes line up.
			</p>
		</section>
	{/if}

	<!-- Contact -->
	{#if member.email || member.phone || member.capitol_address}
		<section class="section">
			<h2>Contact {member.full_name}</h2>
			<p class="contact-intro">You elected them — they answer to you. Reach out about their record.</p>
			<div class="contact-links">
				{#if member.email}
					<a class="contact-link" href="mailto:{member.email}?subject={encodeURIComponent('A constituent about your voting record')}&body={encodeURIComponent(contactBody)}">
						<span aria-hidden="true">✉️</span> Email {member.is_current === false ? '' : 'your rep'}
					</a>
				{/if}
				{#if member.phone}
					<a class="contact-link" href="tel:{member.phone}"><span aria-hidden="true">📞</span> {member.phone}</a>
				{/if}
			</div>
			<p class="contact-note">The email opens with a short, editable message — make it your own.</p>
			{#if member.capitol_address}
				<p class="capitol-address"><span aria-hidden="true">📍</span> {member.capitol_address}</p>
			{/if}
		</section>
	{/if}

	<!-- Badges -->
	{#if member.canary_badges?.length}
		<section class="section">
			<h2>Badges</h2>
			<div class="badges-grid">
				{#each member.canary_badges as badge}
					{@const b = getBadgeData(badge)}
					{#if b}
						<div class="badge-card">
							<span class="badge-emoji">{b.emoji}</span>
							<div>
								<div class="badge-name">{b.name}</div>
								<div class="badge-desc">{b.desc}</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/if}

	<section class="section">
		<h2>How {member.full_name} Votes</h2>
		{#if member.ai_profile_summary}
			<div class="ai-block">
				<p>{member.ai_profile_summary}</p>
			</div>
		{:else}
			<p class="placeholder">Voting profile coming soon.</p>
		{/if}
	</section>

	<!-- Sponsored Bills -->
	{#if data.sponsored.length}
		<section class="section">
			<h2>Bills Sponsored</h2>
			<ul class="sponsored-list">
				{#each data.sponsored as s}
					{#if s.bills}
						{@const alKey = effectiveAlignment(s.bills)}
						{@const al = alKey ? alignmentLabels[alKey] : null}
						{@const imp = getBillImpactTier(effectiveImpactTier(s.bills))}
						<li>
							<a href="/bills/{s.bills.id}">
								<span class="bill-num">{s.bills.bill_number}</span>
								{s.bills.title}
							</a>
							<BillStatusBadge status={s.bills.status} />
							{#if al}
								<span class="alignment-badge {al.cssClass}">{al.label}</span>
							{/if}
							{#if imp}
								<span class="impact-badge">{imp.emoji}</span>
							{/if}
						</li>
					{/if}
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Vote History -->
	{#if data.votes.length}
		<section class="section">
			<h2>Vote History</h2>
			<div class="vote-history">
				{#each data.votes as vote}
					{@const valKey = effectiveAlignment(vote.bills)}
					{@const val = valKey ? alignmentLabels[valKey] : null}
					{@const vimp = getBillImpactTier(effectiveImpactTier(vote.bills))}
					<div class="vote-row">
						<span class="vote-badge {voteColor(vote.vote_value)}">{vote.vote_text}</span>
						{#if val}
							<span class="alignment-badge {val.cssClass}">{val.label}</span>
						{/if}
						{#if vimp}
							<span class="impact-badge">{vimp.emoji}</span>
						{/if}
						{#if isReviewed(vote.bills)}
							<span class="reviewed-mark" title="A human reviewed and corrected this bill's classification">✏️</span>
						{/if}
						{#if vote.bills}
							<a href="/bills/{vote.bills.id}" class="vote-bill">
								<span class="bill-num">{vote.bills.bill_number}</span>
								{vote.bills.title}
							</a>
						{/if}
					</div>
				{/each}
			</div>
			<Pagination page={data.votePage} totalPages={data.voteTotalPages} onchange={changeVotePage} />
			<a class="rss-follow" href="/feeds/member/{member.id}.xml">🔔 Follow {member.full_name}'s votes by RSS — anonymous, no signup</a>
		</section>
	{/if}

	<p class="score-note">
		The Canary Score is our opinion — a consistent methodology applied to {member.full_name}'s own
		voting and sponsorship record. It is not a statement of fact about their character. The bill
		classification behind it is AI-generated and imperfect; expand any score to check the votes yourself,
		or <a href="/terms">read the full methodology</a>. Legislative data from
		<a href="https://legiscan.com/" target="_blank" rel="noopener noreferrer">LegiScan</a>.
	</p>
</div>

<style>
	.back-link {
		display: inline-block;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-bottom: var(--space-lg);
	}

	.member-header {
		margin-bottom: var(--space-xl);
	}
	.header-top {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
	}
	.member-portrait {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		object-fit: cover;
		object-position: center 15%;
		flex-shrink: 0;
		border: 3px solid var(--color-border);
	}
	.placeholder-portrait {
		background: var(--color-bg-hover);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-dim);
		font-weight: 700;
		font-size: 2rem;
	}
	.header-text {
		flex: 1;
	}
	.member-meta {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}
	.sep {
		color: var(--color-text-dim);
	}
	.election-year {
		color: var(--color-accent);
		font-weight: 600;
	}
	.former-year {
		color: var(--color-text-dim);
		font-weight: 600;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
	}
	.leadership-tag {
		display: inline-block;
		margin-top: var(--space-xs);
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		background: var(--color-bg-hover);
		border: 1px solid var(--color-accent-dim);
		color: var(--color-accent);
		font-weight: 600;
		font-size: 0.875rem;
	}

	.header-actions {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		margin-top: var(--space-sm);
	}
	.share-btn {
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 0.2rem 0.75rem;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.share-btn:hover {
		color: var(--color-text);
		border-color: var(--color-accent);
	}

	.contact-intro {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		margin-bottom: var(--space-md);
	}
	.contact-links {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}
	.contact-link {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		background: var(--color-accent);
		color: #1a1a1a;
		border-radius: 6px;
		font-weight: 600;
		font-size: 0.875rem;
	}
	.contact-link:hover {
		opacity: 0.9;
		text-decoration: none;
	}
	.contact-note {
		margin-top: var(--space-sm);
		font-size: 0.75rem;
		color: var(--color-text-dim);
	}
	.capitol-address {
		margin-top: var(--space-sm);
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.finance {
		display: flex;
		align-items: baseline;
		gap: var(--space-sm);
		flex-wrap: wrap;
		padding: var(--space-md) 0;
	}
	.finance-amount {
		font-size: 2rem;
		font-weight: 800;
		color: var(--color-accent);
	}
	.finance-label {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
	}
	.finance-note {
		font-size: 0.8125rem;
		color: var(--color-text-dim);
		line-height: 1.6;
	}
	.finance-split {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}
	.finance-split-item {
		display: flex;
		flex-direction: column;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.finance-split-amount {
		font-weight: 700;
		font-size: 1.125rem;
	}
	.finance-split-label {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	.finance-subhead {
		font-size: 0.9375rem;
		margin: var(--space-md) 0 var(--space-sm);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.finance-list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-md);
	}
	.finance-list li {
		display: flex;
		align-items: baseline;
		gap: var(--space-sm);
		padding: var(--space-xs) 0;
		border-bottom: 1px solid var(--color-border);
		font-size: 0.9375rem;
	}
	.finance-list li:last-child {
		border-bottom: none;
	}
	.finance-list-name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.finance-list-sector {
		font-size: 0.75rem;
		color: var(--color-text-dim);
		white-space: nowrap;
	}
	.finance-list-amount {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.section {
		margin-bottom: var(--space-xl);
	}
	.section h2 {
		margin-bottom: var(--space-md);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border);
	}

	/* Canary Score Hero */
	.score-section {
		margin-bottom: var(--space-xl);
	}
	.score-hero {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		padding: var(--space-lg);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 12px;
	}
	.score-circle {
		flex-shrink: 0;
		width: 80px;
		height: 80px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.score-big {
		font-size: 2rem;
		font-weight: 800;
		color: #fff;
	}
	.score-excellent { background: var(--color-score-excellent); }
	.score-good { background: var(--color-score-good); }
	.score-neutral { background: var(--color-score-neutral); }
	.score-poor { background: var(--color-score-poor); }
	.score-bad { background: var(--color-score-bad); }
	.score-terrible { background: var(--color-score-terrible); }
	.score-unscored { background: var(--color-text-dim); }

	/* Dark numerals on the light-background tiers for legible contrast (WCAG) */
	.score-good .score-big,
	.score-neutral .score-big,
	.score-poor .score-big {
		color: #1a1a1a;
	}

	.score-details {
		flex: 1;
	}
	.tier-label {
		font-size: 1.25rem;
		font-weight: 700;
		margin-bottom: var(--space-xs);
	}
	.tier-1 .tier-label { color: var(--color-score-excellent); }
	.tier-2 .tier-label { color: var(--color-score-good); }
	.tier-3 .tier-label { color: var(--color-score-neutral); }
	.tier-4 .tier-label { color: var(--color-score-poor); }
	.tier-5 .tier-label { color: var(--color-score-bad); }
	.tier-6 .tier-label { color: var(--color-score-terrible); }
	.tier-unscored .tier-label { color: var(--color-text-dim); }

	.tier-tagline {
		font-style: italic;
		color: var(--color-text-muted);
		margin-bottom: var(--space-sm);
		font-size: 0.9375rem;
	}
	.score-meta {
		font-size: 0.8125rem;
		color: var(--color-text-dim);
	}

	/* Badges */
	.badges-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.badge-card {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.badge-emoji {
		font-size: 1.5rem;
	}
	.badge-name {
		font-weight: 600;
		font-size: 0.9375rem;
	}
	.badge-desc {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.ai-block {
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: var(--space-lg);
		line-height: 1.65;
	}
	.placeholder {
		color: var(--color-text-dim);
		font-style: italic;
	}

	.sponsored-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.sponsored-list li {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-size: 0.875rem;
	}
	.sponsored-list a {
		color: var(--color-text);
	}
	.bill-num {
		font-weight: 700;
		color: var(--color-accent);
		margin-right: var(--space-xs);
	}

	.vote-history {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.vote-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
		border-bottom: 1px solid var(--color-border);
		font-size: 0.875rem;
	}
	.vote-badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-weight: 600;
		font-size: 0.75rem;
		flex-shrink: 0;
		min-width: 3.5rem;
		text-align: center;
	}
	.vote-yea { background: var(--color-yea); color: #fff; }
	.vote-nay { background: var(--color-nay); color: #fff; }
	.vote-nv { background: var(--color-nv); color: #fff; }
	.vote-absent { background: var(--color-absent); color: #fff; }
	.vote-bill {
		color: var(--color-text);
	}
	.alignment-badge {
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.alignment-people {
		background: var(--color-yea);
		color: #fff;
	}
	.alignment-capital {
		background: var(--color-nay);
		color: #fff;
	}
	.alignment-neutral {
		background: var(--color-border);
		color: var(--color-text-muted);
	}
	.impact-badge {
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	.score-note {
		font-size: 0.75rem;
		color: var(--color-text-dim);
		text-align: center;
		padding: var(--space-lg) 0;
		line-height: 1.6;
	}

	.score-disclaimer {
		margin-top: var(--space-md);
		font-size: 0.75rem;
		color: var(--color-text-dim);
		line-height: 1.6;
	}
	.reviewed-note {
		color: var(--color-accent);
	}
	.reviewed-mark {
		font-size: 0.75rem;
		flex-shrink: 0;
	}
	.rss-follow {
		display: inline-block;
		margin-top: var(--space-md);
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	@media (max-width: 600px) {
		.score-hero {
			flex-direction: column;
			text-align: center;
		}
		.header-top {
			flex-direction: column;
			text-align: center;
		}
		.member-meta {
			justify-content: center;
		}
		.member-portrait {
			width: 80px;
			height: 80px;
		}
	}
</style>
