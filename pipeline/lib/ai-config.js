/**
 * CANARY BLAIR — Shared AI model configuration
 *
 * The single place the Claude model is chosen. Imported by the AI worker and
 * the summarize/profiles CLI scripts so all three always agree.
 *
 * We default to Sonnet because the model's bill classification (alignment +
 * impact tier) directly drives every Canary Score — accuracy there is worth
 * more than the per-call savings of a smaller model. Swap this one string to
 * change the model everywhere:
 *   - claude-sonnet-5   (default — best accuracy/cost balance for this job)
 *   - claude-haiku-4-5  (cheapest/fastest; fine for plain summaries)
 *   - claude-opus-4-8   (highest quality; likely overkill at bill volume)
 */
export const CLAUDE_MODEL = 'claude-sonnet-5';

/**
 * These are structured-extraction calls (JSON out, or a short plain-text
 * profile) — not open-ended reasoning. Sonnet 5 runs adaptive thinking by
 * default, which would prepend thinking blocks to the response and inflate
 * latency/cost; we disable it so the output is a clean, parseable answer and
 * costs stay predictable at bill volume.
 */
export const THINKING_DISABLED = { type: 'disabled' };

/**
 * Adaptive thinking — let the model reason before it answers. Reserved for the
 * bill CLASSIFICATION call (alignment + impact tier), the project's highest-
 * stakes judgment, where reasoning-before-labeling materially improves
 * accuracy. extractText() skips the resulting thinking blocks, so JSON parsing
 * is unaffected. Callers using this MUST allow generous max_tokens (thinking
 * tokens count against the budget) — see the summarize call.
 */
export const THINKING_ADAPTIVE = { type: 'adaptive' };

/**
 * Pull the assistant's text out of a Messages API response, skipping any
 * non-text blocks (e.g. thinking) so a model or default change can't silently
 * break JSON parsing. Returns '' if there's no text block.
 */
export function extractText(data) {
	const block = (data?.content || []).find((b) => b.type === 'text');
	return block ? block.text : '';
}
