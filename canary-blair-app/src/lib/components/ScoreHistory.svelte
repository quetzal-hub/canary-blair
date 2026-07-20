<script>
	import { formatDate, scoreColor } from '$lib/utils.js';

	let { history } = $props();

	// Only snapshots that actually have a score, in chronological order.
	const points = $derived((history || []).filter((h) => h.canary_score != null));

	// SVG sparkline geometry
	const W = 320;
	const H = 60;
	const PAD = 6;

	const path = $derived.by(() => {
		if (points.length < 2) return '';
		const xs = (i) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
		const ys = (s) => H - PAD - (s / 100) * (H - 2 * PAD); // 0–100 scale
		return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(p.canary_score).toFixed(1)}`).join(' ');
	});

	const latest = $derived(points.length ? points[points.length - 1] : null);
	const first = $derived(points.length ? points[0] : null);
	const delta = $derived(latest && first ? latest.canary_score - first.canary_score : 0);
</script>

{#if points.length >= 2}
	<div class="history">
		<div class="history-head">
			<span class="history-title">Score over time</span>
			<span class="delta {delta >= 0 ? 'pos' : 'neg'}">
				<span aria-hidden="true">{delta >= 0 ? '▲' : '▼'}</span> {Math.abs(delta)} since {formatDate(first.snapshot_date)}
			</span>
		</div>
		<p class="sr-only">
			Canary Score history: {points.length} recorded scores. Started at {first.canary_score} on
			{formatDate(first.snapshot_date)} and is now {latest.canary_score} as of {formatDate(latest.snapshot_date)},
			a change of {delta >= 0 ? 'up' : 'down'} {Math.abs(delta)} points.
		</p>
		<svg viewBox="0 0 {W} {H}" class="spark" preserveAspectRatio="none" role="img" aria-hidden="true">
			<line x1={PAD} y1={H - PAD - (50 / 100) * (H - 2 * PAD)} x2={W - PAD} y2={H - PAD - (50 / 100) * (H - 2 * PAD)} class="midline" />
			<path d={path} class="line" fill="none" />
			{#each points as p, i}
				{@const cx = PAD + (i / (points.length - 1)) * (W - 2 * PAD)}
				{@const cy = H - PAD - (p.canary_score / 100) * (H - 2 * PAD)}
				<circle {cx} {cy} r={p.is_final ? 3 : 2} class={scoreColor(p.canary_score)} class:final={p.is_final}>
					<title>{formatDate(p.snapshot_date)}: {p.canary_score}{p.is_final ? ' (final — session closed)' : ''}</title>
				</circle>
			{/each}
		</svg>
		<p class="history-note">
			A permanent record. Once a session adjourns, its score is locked (larger dot) — a legislator
			cannot vote their way out of a past session's tier.
		</p>
	</div>
{/if}

<style>
	.history {
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: var(--space-md);
		margin-bottom: var(--space-xl);
	}
	.history-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: var(--space-sm);
	}
	.history-title { font-weight: 700; font-size: 0.9375rem; }
	.delta { font-size: 0.8125rem; font-weight: 600; }
	.delta.pos { color: var(--color-yea); }
	.delta.neg { color: var(--color-nay); }
	.spark {
		width: 100%;
		height: 60px;
		display: block;
	}
	.line {
		stroke: var(--color-accent);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.midline {
		stroke: var(--color-border);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		vector-effect: non-scaling-stroke;
	}
	circle { fill: var(--color-accent); }
	circle.final { stroke: var(--color-text); stroke-width: 1; }
	circle.score-excellent { fill: var(--color-score-excellent); }
	circle.score-good { fill: var(--color-score-good); }
	circle.score-neutral { fill: var(--color-score-neutral); }
	circle.score-poor { fill: var(--color-score-poor); }
	circle.score-bad { fill: var(--color-score-bad); }
	circle.score-terrible { fill: var(--color-score-terrible); }
	.history-note {
		font-size: 0.75rem;
		color: var(--color-text-dim);
		line-height: 1.5;
		margin-top: var(--space-sm);
	}
</style>
