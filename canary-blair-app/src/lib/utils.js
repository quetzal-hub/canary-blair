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
 * Canary Score tier data from tier number
 */
const TIERS = [
	null,
	{ name: 'Mountaineer', emoji: '✨', tagline: 'Votes like they actually live here.', cssClass: 'tier-1' },
	{ name: 'Friend of the Holler', emoji: '🌱', tagline: "Not perfect, but they're trying.", cssClass: 'tier-2' },
	{ name: 'Weathervane', emoji: '🌫️', tagline: 'Blows whichever way the lobby goes.', cssClass: 'tier-3' },
	{ name: 'Company Man', emoji: '🪨', tagline: 'Reliable — just not for you.', cssClass: 'tier-4' },
	{ name: 'Rat in the Capitol', emoji: '🐀', tagline: 'Actively working against the people who elected them.', cssClass: 'tier-5' },
	{ name: 'Owned', emoji: '☠️', tagline: 'Congratulations to their donors on their investment.', cssClass: 'tier-6' }
];

export function getTierData(tierNum) {
	if (!tierNum || tierNum < 1 || tierNum > 6) return null;
	return TIERS[tierNum];
}

const BADGES = {
	'lone-canary': { emoji: '🦅', name: 'Lone Canary', desc: 'Voted against their own party on bills for the people.' },
	'ghost': { emoji: '👻', name: 'Ghost', desc: "NV or absent on more than 25% of all votes." },
	'corporate-friend': { emoji: '💰', name: "Never Met a Corporation They Didn't Like", desc: '90%+ of corporate-interest votes were Yea.' },
	'lockstep': { emoji: '🔒', name: 'Lockstep', desc: 'Voted with their party 95%+ of the time.' },
	'water-protector': { emoji: '💧', name: 'Water Protector', desc: 'Consistently votes for water and environment protections, and against bills that weaken them.' },
	'friend-of-worker': { emoji: '👷', name: 'Friend of the Worker', desc: 'Consistently votes for worker protections, and against bills that weaken them.' }
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

export function scoreColor(score) {
	if (score == null) return 'score-unscored';
	if (score >= 80) return 'score-excellent';
	if (score >= 60) return 'score-good';
	if (score >= 45) return 'score-neutral';
	if (score >= 35) return 'score-poor';
	if (score >= 20) return 'score-bad';
	return 'score-terrible';
}
