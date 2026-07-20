/**
 * Format ISO date string to human-readable format
 * e.g. "2026-03-13" → "March 13, 2026"
 */
export function formatDate(dateStr) {
	if (!dateStr) return '';
	const date = new Date(dateStr + 'T00:00:00');
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}

/**
 * Format ISO date string to short format
 * e.g. "2026-03-13" → "Mar 13"
 */
export function formatDateShort(dateStr) {
	if (!dateStr) return '';
	const date = new Date(dateStr + 'T00:00:00');
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Calculate days since a date
 */
export function daysSince(dateStr) {
	if (!dateStr) return null;
	const date = new Date(dateStr + 'T00:00:00');
	const now = new Date();
	const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
	return diff;
}

/**
 * Returns CSS class name for vote value
 * 1=Yea, 2=Nay, 3=NV, 4=Absent
 */
export function voteColor(voteValue) {
	switch (voteValue) {
		case 1: return 'vote-yea';
		case 2: return 'vote-nay';
		case 3: return 'vote-nv';
		case 4: return 'vote-absent';
		default: return 'vote-nv';
	}
}

/**
 * Returns human label from LegiScan status code
 */
export function statusLabel(statusCode) {
	const labels = {
		1: 'Introduced',
		2: 'Engrossed',
		3: 'Enrolled',
		4: 'Passed',
		5: 'Vetoed',
		6: 'Failed'
	};
	return labels[statusCode] || 'Unknown';
}

/**
 * Returns CSS class name for status badge
 */
export function statusColor(statusCode) {
	switch (statusCode) {
		case 1: return 'status-introduced';
		case 2: return 'status-engrossed';
		case 3: return 'status-enrolled';
		case 4: return 'status-passed';
		case 5: return 'status-vetoed';
		case 6: return 'status-failed';
		default: return 'status-introduced';
	}
}

/**
 * Chamber code to label
 */
export function chamberLabel(chamber) {
	if (chamber === 'H') return 'House';
	if (chamber === 'S') return 'Senate';
	return chamber || '';
}

/**
 * Party code to label
 */
export function partyLabel(party) {
	const parties = {
		D: 'Democrat',
		R: 'Republican',
		I: 'Independent',
		L: 'Libertarian',
		G: 'Green'
	};
	return parties[party] || party || 'Unknown';
}

/**
 * Party code to CSS class
 */
export function partyColor(party) {
	switch (party) {
		case 'D': return 'party-d';
		case 'R': return 'party-r';
		default: return 'party-i';
	}
}

/**
 * Vote value to text
 */
export function voteText(voteValue) {
	const texts = { 1: 'Yea', 2: 'Nay', 3: 'NV', 4: 'Absent' };
	return texts[voteValue] || 'Unknown';
}

/**
 * Truncate text to a max length with ellipsis
 */
export function truncate(text, maxLen = 120) {
	if (!text || text.length <= maxLen) return text || '';
	return text.slice(0, maxLen).trimEnd() + '…';
}

/**
 * Canary Score tier data — derived from the shared per-state config so the
 * frontend, the scoring engine, and the AI prompts all use one set of tier
 * names/taglines. Edit pipeline/lib/state-config.js to change them everywhere.
 */
import { STATE_CONFIG } from '$stateConfig';

const TIERS = [null];
for (const t of [...STATE_CONFIG.tiers].sort((a, b) => a.tier - b.tier)) {
	TIERS[t.tier] = { name: t.name, emoji: t.emoji, tagline: t.tagline, cssClass: `tier-${t.tier}` };
}

export function getTierData(tierNum) {
	if (!tierNum || tierNum < 1 || tierNum > 6) return null;
	return TIERS[tierNum];
}

/** Tier number (1-6) a score falls into, per the config's thresholds. */
export function tierForScore(score) {
	if (score == null) return null;
	for (const t of STATE_CONFIG.tiers) {
		if (score >= t.min) return t.tier;
	}
	return STATE_CONFIG.tiers[STATE_CONFIG.tiers.length - 1].tier;
}

const BADGES = {
	'lone-canary': { emoji: '🦅', name: 'Lone Canary', desc: 'Voted against their own party on bills for the people.' },
	'ghost': { emoji: '👻', name: 'Ghost', desc: "NV or absent on more than 25% of all votes." },
	'corporate-friend': { emoji: '💰', name: "Never Met a Corporation They Didn't Like", desc: '90%+ of corporate-interest votes were Yea.' },
	'lockstep': { emoji: '🔒', name: 'Lockstep', desc: 'Voted with their party 95%+ of the time.' },
	'water-protector': { emoji: '💧', name: 'Water Protector', desc: 'Consistently votes for water and environment protections, and against bills that weaken them.' },
	'friend-of-worker': { emoji: '👷', name: 'Friend of the Worker', desc: 'Consistently votes for worker protections, and against bills that weaken them.' },
	'renewables-champion': { emoji: '🌞', name: 'Renewables Champion', desc: 'Consistently votes for clean and renewable energy, and against bills that prop up fossil fuels at its expense.' },
	'most-improved': { emoji: '📈', name: 'Most Improved', desc: 'Canary Score rose 15 or more points since last session.' }
};

export function getBadgeData(badgeId) {
	return BADGES[badgeId] || null;
}

/**
 * Bill impact tier data from tier number (1-6)
 */
const BILL_IMPACT_TIERS = [
	null,
	{ name: 'Landmark', emoji: '🔴', desc: 'Transformative structural change affecting thousands of WV residents.', cssClass: 'impact-1', weight: '5x' },
	{ name: 'High Impact', emoji: '🟠', desc: 'Significant real-world consequences for communities, health, or environment.', cssClass: 'impact-2', weight: '3x' },
	{ name: 'Meaningful', emoji: '🟡', desc: 'Clear benefit or harm, but narrower scope.', cssClass: 'impact-3', weight: '2x' },
	{ name: 'Routine', emoji: '🔵', desc: 'Standard legislation with modest impact.', cssClass: 'impact-4', weight: '1x' },
	{ name: 'Minor', emoji: '⚪', desc: 'Small procedural tweaks or technical amendments.', cssClass: 'impact-5', weight: '0.5x' },
	{ name: 'Ceremonial', emoji: '🪶', desc: 'Symbolic acts with no policy impact.', cssClass: 'impact-6', weight: '0.25x' }
];

export function getBillImpactTier(tierNum) {
	if (!tierNum || tierNum < 1 || tierNum > 6) return null;
	return BILL_IMPACT_TIERS[tierNum];
}

// Tier rank (1-6) → color class. The rank is state-agnostic; the thresholds
// that map a score to a rank come from the config via tierForScore().
const TIER_COLOR = {
	1: 'score-excellent',
	2: 'score-good',
	3: 'score-neutral',
	4: 'score-poor',
	5: 'score-bad',
	6: 'score-terrible'
};

export function scoreColor(score) {
	const tier = tierForScore(score);
	return tier == null ? 'score-unscored' : TIER_COLOR[tier];
}

// ─────────────────────────────────────────
// Score audit math — MIRRORS pipeline/lib/scoring.js.
// Kept in sync by pipeline/test/scoring.test.js on the engine side; if you
// change the point rules or weights there, change them here too. (The app and
// pipeline are separate packages, so they can't share one import.)
// ─────────────────────────────────────────

export const TIER_WEIGHTS = { 1: 5, 2: 3, 3: 2, 4: 1, 5: 0.5, 6: 0.25 };

/** Effective (post-human-override) bill values. */
export function effectiveAlignment(bill) {
	return bill?.ai_alignment_override ?? bill?.ai_alignment ?? null;
}
export function effectiveImpactTier(bill) {
	return bill?.ai_impact_tier_override ?? bill?.ai_impact_tier ?? null;
}
export function isReviewed(bill) {
	return bill?.ai_alignment_override != null || bill?.ai_impact_tier_override != null;
}
export function billWeight(bill) {
	return TIER_WEIGHTS[effectiveImpactTier(bill)] ?? 1;
}

/** Signed points a single vote contributes. Positive = helped, negative = hurt. */
export function votePoints(alignment, voteValue, weight) {
	if (alignment === 'for_people') {
		if (voteValue === 1) return weight;
		if (voteValue === 2) return -weight;
		return -weight * 0.25;
	}
	if (alignment === 'for_capital') {
		if (voteValue === 1) return -weight;
		if (voteValue === 2) return weight;
		return -weight * 0.25;
	}
	return 0;
}

export const SPONSOR_WEIGHTS = { 1: 3, 2: 1.5 };
