<script>
	let { data } = $props();
	const consensusPct = $derived(
		data.totalRollCalls ? Math.round((data.consensus / data.totalRollCalls) * 100) : 0
	);
	const peopleFloorPct = $derived(
		data.people.total ? Math.round((data.people.floor / data.people.total) * 100) : 0
	);
	const capitalFloorPct = $derived(
		data.capital.total ? Math.round((data.capital.floor / data.capital.total) * 100) : 0
	);
</script>

<svelte:head>
	<title>The Theater — how a legislature games accountability — Canary Blair</title>
	<meta
		name="description"
		content="A Canary Score can only measure the votes a legislator was allowed to take. Here's how the West Virginia legislature engineers a record that looks benevolent — and how to read past it."
	/>
</svelte:head>

<div class="container prose">
	<h1>The Theater</h1>
	<p class="lede">
		A Canary Score measures how a legislator voted on the bills that reached the floor. That sounds like
		the whole story. It isn't — because <strong>the bills that reach the floor are chosen</strong>, and the
		choosing is where the real power lives. This page is about what the scores can't see: the machinery that
		manufactures a benevolent-looking record while the consequential decisions happen in the dark.
	</p>

	<section>
		<h2>1. Most votes tell you nothing</h2>
		<p>
			Of the <strong>{data.totalRollCalls.toLocaleString()}</strong> recorded votes this session,
			<strong>{data.consensus.toLocaleString()} ({consensusPct}%)</strong> were near-unanimous — the
			winning side took 85% or more. Only <strong>{data.contested}</strong> were genuinely contested, where
			the minority held at least 30%.
		</p>
		<p>
			A "yea" cast alongside 95% of the chamber, on a bill nobody opposed, reveals almost nothing about a
			legislator's values. Yet those consensus votes make up the overwhelming bulk of every member's record.
			Add them up naively and everyone looks great — because everyone voted the same way, on the same
			agreeable bills, by design. <strong>The handful of votes that actually divide the chamber are the only
			ones that reveal who someone is</strong>, and they're outnumbered roughly {Math.round(data.consensus / Math.max(data.contested, 1))}-to-1.
			(This is why the Canary Score now weights a divided vote far more heavily than a consensus one — see
			<a href="/about">the methodology</a>.)
		</p>
	</section>

	<section>
		<h2>2. The menu is rigged before you ever see it</h2>
		<p>
			Here is the number that should stop you cold. Among the highest-impact bills of the session — the
			Landmark and High-Impact ones that actually shape whether West Virginia stays last in the metrics that
			matter:
		</p>
		<div class="contrast">
			<div class="contrast-col people">
				<div class="contrast-big">{peopleFloorPct}%</div>
				<div class="contrast-label">of high-impact <strong>pro-people</strong> bills reached a floor vote</div>
				<div class="contrast-detail">{data.people.floor} reached the floor · <strong>{data.people.died} died in committee with no vote</strong></div>
			</div>
			<div class="contrast-col capital">
				<div class="contrast-big">{capitalFloorPct}%</div>
				<div class="contrast-label">of high-impact <strong>pro-capital</strong> bills reached a floor vote</div>
				<div class="contrast-detail">{data.capital.floor} reached the floor · {data.capital.died} died</div>
			</div>
		</div>
		{#if data.floorRatio}
			<p>
				Among high-impact bills that made it to a vote, the ones favoring corporate and moneyed interests
				outnumbered the ones favoring ordinary West Virginians <strong>{data.floorRatio}-to-1</strong>.
				Meanwhile <strong>{data.people.died} high-impact bills that would have helped people were quietly
				buried in committee</strong> — no hearing, no vote, no fingerprints. You can see them, and the
				committees that killed them, in <a href="/graveyard">the Graveyard</a>.
			</p>
		{/if}
	</section>

	<section>
		<h2>3. How the machine works</h2>
		<p>The pattern is consistent, and once you see it you can't unsee it:</p>
		<ol class="machine">
			<li>
				<strong>Flood the floor with consensus candy.</strong> Cancer-screening awareness, commemorations,
				small uncontroversial programs — real but minor pro-people bills that everyone can vote yes on.
				Every legislator collects a pile of "for the people" votes at zero political cost.
			</li>
			<li>
				<strong>Bury the big pro-people bills in committee.</strong> Medicaid expansion, real environmental
				protection, structural reform — referred to a committee and left to die without a recorded vote, so
				no individual legislator ever has to be on record against them.
			</li>
			<li>
				<strong>Pass the big corporate bills with a comfortable margin.</strong> Large enough that no single
				vote looks decisive, so blame diffuses across the whole majority and no one is uniquely accountable.
			</li>
		</ol>
		<p>
			The result is a public record engineered to look benevolent. The state stays near the bottom of nearly
			every national ranking not because legislators vote wrong on what reaches the floor — mostly they vote
			for the modest good stuff — but because of <strong>what never reaches the floor at all.</strong>
		</p>
	</section>

	{#if data.buriedExample || data.passedCapitalExample}
		<section>
			<h2>4. Two bills, side by side</h2>
			<div class="examples">
				{#if data.passedCapitalExample}
					<div class="example passed">
						<div class="example-tag">PASSED · became law</div>
						<a href="/bills/{data.passedCapitalExample.id}" class="example-bill">
							{data.passedCapitalExample.bill_number}: {data.passedCapitalExample.title}
						</a>
						{#if data.passedCapitalExample.ai_who_is_hurt}
							<p class="example-note"><strong>Who it hurts:</strong> {data.passedCapitalExample.ai_who_is_hurt}</p>
						{/if}
						<p class="example-verdict">A high-impact bill favoring capital — and it got a vote, and it won.</p>
					</div>
				{/if}
				{#if data.buriedExample}
					<div class="example buried">
						<div class="example-tag">DIED · no vote ever taken</div>
						<a href="/bills/{data.buriedExample.id}" class="example-bill">
							{data.buriedExample.bill_number}: {data.buriedExample.title}
						</a>
						{#if data.buriedExample.ai_who_benefits}
							<p class="example-note"><strong>Who it would have helped:</strong> {data.buriedExample.ai_who_benefits}</p>
						{/if}
						<p class="example-verdict">
							A {data.buriedExample.ai_impact_tier === 1 ? 'Landmark' : 'High-Impact'} pro-people bill —
							killed in {data.buriedExample.committee_name || 'committee'} without a single recorded vote.
						</p>
					</div>
				{/if}
			</div>
			<p class="example-caption">Guess which one leadership wanted you to notice.</p>
		</section>
	{/if}

	<section>
		<h2>What this means for the scores</h2>
		<p>
			We built the Canary Score to be as honest as a vote-based score can be: it heavily weights the votes
			that actually divided the chamber, so it can't be gamed by piling up consensus candy. On its own terms
			it's accurate and auditable — every point is <a href="/members">shown and checkable</a>.
		</p>
		<p>
			But understand exactly what it answers: <em>"given the choices leadership permitted, whose side did
			this person take?"</em> — not <em>"is this person good for West Virginia?"</em>, because the biggest
			decisions were never offered as choices. That second question is answered in
			<a href="/graveyard">the Graveyard</a> and by the committee chairs who control what dies there. Read
			the score for how someone behaved on the record; read the Graveyard for the record they made sure was
			never created.
		</p>
	</section>
</div>

<style>
	.prose { max-width: 760px; }
	h1 { margin-bottom: var(--space-md); }
	.lede { font-size: 1.125rem; line-height: 1.7; color: var(--color-text); margin-bottom: var(--space-xl); }
	section { margin-bottom: var(--space-2xl); }
	section h2 { margin-bottom: var(--space-md); padding-bottom: var(--space-sm); border-bottom: 1px solid var(--color-border); }
	section p { line-height: 1.75; color: var(--color-text-muted); margin-bottom: var(--space-md); }
	section p strong { color: var(--color-text); }

	.contrast { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); margin: var(--space-lg) 0; }
	.contrast-col { padding: var(--space-lg); border-radius: 12px; border: 1px solid var(--color-border); text-align: center; }
	.contrast-col.people { border-left: 4px solid var(--color-yea, #5b8c5a); }
	.contrast-col.capital { border-left: 4px solid var(--color-nay, #b85450); }
	.contrast-big { font-size: 2.75rem; font-weight: 800; line-height: 1; }
	.people .contrast-big { color: var(--color-yea, #5b8c5a); }
	.capital .contrast-big { color: var(--color-nay, #b85450); }
	.contrast-label { font-size: 0.9375rem; color: var(--color-text-muted); margin-top: var(--space-sm); line-height: 1.5; }
	.contrast-detail { font-size: 0.8125rem; color: var(--color-text-dim); margin-top: var(--space-sm); }

	.machine { padding-left: 0; list-style: none; counter-reset: step; }
	.machine li { position: relative; padding-left: 2.5rem; margin-bottom: var(--space-md); line-height: 1.7; color: var(--color-text-muted); counter-increment: step; }
	.machine li::before {
		content: counter(step);
		position: absolute; left: 0; top: 0;
		width: 1.75rem; height: 1.75rem; border-radius: 50%;
		background: var(--color-accent); color: #fff;
		display: flex; align-items: center; justify-content: center;
		font-weight: 800; font-size: 0.875rem;
	}
	.machine li strong { color: var(--color-text); }

	.examples { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); margin: var(--space-md) 0; }
	.example { padding: var(--space-md); border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-bg-raised); }
	.example.passed { border-top: 4px solid var(--color-nay, #b85450); }
	.example.buried { border-top: 4px solid var(--color-text-dim); }
	.example-tag { font-size: 0.6875rem; font-weight: 800; letter-spacing: 0.04em; color: var(--color-text-dim); margin-bottom: var(--space-sm); }
	.example-bill { display: block; font-weight: 700; font-size: 0.9375rem; margin-bottom: var(--space-sm); line-height: 1.4; }
	.example-note { font-size: 0.8125rem; line-height: 1.6; margin-bottom: var(--space-sm) !important; }
	.example-verdict { font-size: 0.8125rem; color: var(--color-text-dim) !important; font-style: italic; margin-bottom: 0 !important; }
	.example-caption { text-align: center; font-style: italic; color: var(--color-text-dim); }

	@media (max-width: 620px) {
		.contrast, .examples { grid-template-columns: 1fr; }
	}
</style>
