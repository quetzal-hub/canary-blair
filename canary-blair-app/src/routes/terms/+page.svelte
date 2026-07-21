<svelte:head>
	<title>Terms & Methodology — Canary Blair</title>
</svelte:head>

<div class="container">
	<h1>Terms, Methodology & Disclaimer</h1>
	<p class="updated">Plain language. No fine print.</p>

	<section>
		<h2>What this is</h2>
		<p>
			Canary Blair is <strong>commentary and analysis based on public records</strong>. It reproduces
			the official legislative record — bills, votes, and sponsorships — and offers our own assessment
			of that record. It is published in the public interest to help ordinary people understand what
			their elected officials are doing.
		</p>
	</section>

	<section>
		<h2>The record is fact. The Canary Score is opinion.</h2>
		<p>
			We draw a clear line between the two:
		</p>
		<ul>
			<li>
				<strong>Votes, sponsorships, and bill text</strong> come directly from the public legislative
				record and are reproduced as accurately as our data source allows. These are facts.
			</li>
			<li>
				<strong>The Canary Score, tiers, badges, and bill classifications</strong> are our
				<strong>opinion</strong> — an assessment derived from a disclosed, consistent methodology
				applied to that public record. Reasonable people can disagree with them. The tier names and
				taglines are deliberately pointed commentary, not literal statements of fact.
			</li>
		</ul>
		<p>
			Because we show the underlying votes behind every score (see any member's "How we got this
			number"), you never have to take our word for it — you can check the math yourself. That is the
			whole point.
		</p>
	</section>

	<section>
		<h2>The AI classification is imperfect — and we say so everywhere</h2>
		<p>
			Whether a bill is "for the people" or "for capital," and how consequential it is, is assigned by
			an AI model reasoning over the bill's text. This is genuinely useful but <strong>not perfect</strong>.
			We never present a classification as established fact. Low-confidence classifications are flagged.
			A human can review and correct any of them, and corrections are marked as such.
		</p>
		<p>
			Nothing on this site is a statement of fact about any person's character, honesty, or criminal
			conduct. A low score means a voting record that, by our methodology, favors corporate over public
			interest — it is not an accusation of a crime.
		</p>
	</section>

	<section>
		<h2>Found something wrong? Tell us.</h2>
		<p>
			If you believe a bill is misclassified — including if you are a legislator or a member of their
			staff — every bill page has a <strong>"Flag it for review"</strong> link. We take corrections
			seriously and a human will look at flagged bills. We would rather fix an error than defend one.
		</p>
	</section>

	<section>
		<h2>Data sources</h2>
		<ul>
			<li>Legislative data from <a href="https://legiscan.com/" target="_blank" rel="noopener noreferrer">LegiScan</a>, a nonpartisan service, used under its terms.</li>
			<li>District lookups from the <a href="https://www.census.gov/" target="_blank" rel="noopener noreferrer">U.S. Census Bureau</a> geocoder.</li>
			<li>Campaign-finance figures, where shown, from <a href="https://www.followthemoney.org/" target="_blank" rel="noopener noreferrer">FollowTheMoney</a>.</li>
		</ul>
		<p>The scores and analysis are our own and are released to the public domain.</p>
	</section>

	<section>
		<h2>No warranty</h2>
		<p>
			This site is provided "as is," in good faith, for informational and civic purposes. We work to be
			accurate but make no guarantee that every record or assessment is complete or error-free. It is
			not legal, financial, or voting advice. Use your own judgment.
		</p>
	</section>

	<section>
		<h2>Privacy</h2>
		<p>
			We collect nothing about you — no accounts, no analytics, no tracking. "My Reps" lives only in
			your browser. See the <a href="/about">About</a> page for the full privacy commitment.
		</p>
	</section>
</div>

<style>
	h1 { margin-bottom: var(--space-xs); }
	.updated { color: var(--color-text-dim); font-size: 0.875rem; margin-bottom: var(--space-xl); }
	section { margin-bottom: var(--space-xl); }
	h2 { color: var(--color-accent); margin-bottom: var(--space-md); font-size: 1.125rem; }
	p { line-height: 1.7; margin-bottom: var(--space-md); color: var(--color-text); }
	ul { list-style: none; padding: 0; margin-bottom: var(--space-md); }
	li { padding: var(--space-sm) 0; border-bottom: 1px solid var(--color-border); color: var(--color-text-muted); line-height: 1.6; }
	li strong { color: var(--color-text); }
</style>
