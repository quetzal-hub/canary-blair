/**
 * CANARY BLAIR — Per-state configuration
 *
 * Everything that makes Canary Blair "West Virginia" lives here. To run the
 * project for another state, copy this file, change the values, and redeploy —
 * the scoring engine, the AI prompts, and the tier names all read from it.
 *
 * Kept deliberately small and dependency-free so it can be imported by both
 * the pipeline (Node) and, if needed, mirrored into the SvelteKit app.
 */

export const STATE_CONFIG = {
	// LegiScan two-letter state code (drives the sync worker too).
	code: 'WV',
	name: 'West Virginia',
	demonym: 'West Virginians',
	demonymSingular: 'West Virginia resident',
	legislatureName: 'West Virginia Legislature',
	lowerChamber: 'House of Delegates',
	upperChamber: 'Senate',

	// Industries whose interests the score treats as "capital." Surfaced in the
	// summarization prompt so the model knows which local sectors to watch.
	// (WV: coal and gas. TX would be oil/gas; a farm state might be agribusiness.)
	extractiveIndustries: 'coal, gas, and energy companies',

	// A one-clause reminder of local stakes, injected into the "who is hurt"
	// guidance so environmental/health harms are weighted appropriately.
	localStakesNote:
		'a state with known water contamination problems, so bills touching water, environment, or public health should be weighed more seriously',

	// Canary tiers. Order matters — highest threshold first. `min` is the
	// inclusive lower bound of the tier's score range.
	tiers: [
		{ min: 80, tier: 1, name: 'Mountaineer', emoji: '✨', tagline: 'Votes like they actually live here.' },
		{ min: 60, tier: 2, name: 'Friend of the Holler', emoji: '🌱', tagline: "Not perfect, but they're trying." },
		{ min: 45, tier: 3, name: 'Weathervane', emoji: '🌫️', tagline: 'Blows whichever way the lobby goes.' },
		{ min: 35, tier: 4, name: 'Company Man', emoji: '🪨', tagline: 'Reliable — just not for you.' },
		{ min: 20, tier: 5, name: 'Rat in the Capitol', emoji: '🐀', tagline: 'Actively working against the people who elected them.' },
		{ min: 0, tier: 6, name: 'Owned', emoji: '☠️', tagline: 'Congratulations to their donors on their investment.' }
	]
};
