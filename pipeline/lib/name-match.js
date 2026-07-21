/**
 * CANARY BLAIR — shared name-matching helpers
 *
 * Used wherever we have to match a LegiScan member record against a name
 * string from a THIRD PARTY source (WV Legislature roster photos, FollowTheMoney
 * candidate lists) that doesn't share a stable id with our data. Extracted so
 * photos.js and finance-eid-lookup.js can't quietly drift apart on what
 * counts as "the same person."
 *
 * The rule throughout: last name must match (exactly, or via a hyphenated-
 * surname half — some sources drop one side of a compound surname), AND at
 * least one of first name / middle name / nickname must match (directly, or
 * via the common nickname-equivalence table below). Both sides must agree;
 * neither alone is enough. This is deliberately conservative — a missed
 * match just means "skip and let a human look," a false match means
 * attaching real data (a photo, a campaign-finance id) to the wrong named
 * person, which is the failure mode worth avoiding.
 */

export function normTokens(str) {
	return (str || '')
		.toLowerCase()
		.replace(/[.,]/g, '')
		.split(/\s+/)
		.filter(Boolean);
}

// Common nickname/formal-name pairs LegiScan doesn't always capture in its own
// nickname field (e.g. "Zack" for a member stored only as "Zachery"). Only
// used to widen the FIRST-name check — the last-name match still gates every
// candidate, so this can't cause a false match on its own.
export const NICKNAME_EQUIV = {
	zachery: ['zack', 'zach', 'zachary'], zachary: ['zack', 'zach', 'zachery'],
	michael: ['mike'], mike: ['michael'],
	william: ['bill', 'will', 'billy'], bill: ['william'],
	robert: ['bob', 'bobby', 'rob'], bob: ['robert'],
	richard: ['rick', 'dick', 'richie'], rick: ['richard'],
	daniel: ['dan', 'danny'], dan: ['daniel'],
	christopher: ['chris'], chris: ['christopher'],
	thomas: ['tom', 'tommy'], tom: ['thomas'],
	joseph: ['joe', 'joey'], joe: ['joseph'],
	james: ['jim', 'jimmy'], jim: ['james'],
	kenneth: ['ken'], ken: ['kenneth'],
	steven: ['steve'], stephen: ['steve'], steve: ['steven', 'stephen'],
	david: ['dave'], dave: ['david'],
	andrew: ['andy'], andy: ['andrew'],
	douglas: ['doug'], doug: ['douglas'],
	gregory: ['greg'], greg: ['gregory'],
	lawrence: ['larry'], larry: ['lawrence'],
	ronald: ['ron'], ron: ['ronald'],
	donald: ['don'], don: ['donald'],
	gerald: ['jerry', 'gerry'], jerry: ['gerald'],
	nicholas: ['nick'], nick: ['nicholas'],
	matthew: ['matt'], matt: ['matthew'],
	anthony: ['tony'], tony: ['anthony'],
	edward: ['ed', 'eddie'], ed: ['edward'],
	charles: ['charlie', 'chuck'], charlie: ['charles'], chuck: ['charles'],
	francis: ['frank'], franklin: ['frank'], frank: ['francis', 'franklin'],
	patrick: ['pat'], pat: ['patrick'],
	benjamin: ['ben'], ben: ['benjamin']
};

/**
 * Candidate token-sets for a last name — ALL tokens in any one set must
 * appear in the other side's tokens for that set to count as a match. The
 * whole name is always a candidate (handles multi-word surnames like "Wakim
 * Chapman"). Hyphenated surnames also get each half (length >= 3) as its own
 * candidate, since some sources drop one half (e.g. a member stored as
 * "Schaaf-Mazzocchi" is listed elsewhere as just "Mazzocchi").
 */
export function lastNameCandidateSets(lastName) {
	const whole = normTokens(lastName);
	const sets = [whole];
	for (const tok of whole) {
		if (tok.includes('-')) {
			for (const part of tok.split('-')) {
				if (part.length >= 3) sets.push([part]);
			}
		}
	}
	return sets;
}

/**
 * Does `otherTokens` (name tokens from the third-party source) refer to the
 * same person as this DB member? `firstNameFields` is an array of the
 * member's own first/middle/nickname strings (any subset can be empty).
 */
export function isNameMatch(lastName, firstNameFields, otherTokens) {
	const lastSets = lastNameCandidateSets(lastName);
	const firstCandidates = firstNameFields.filter(Boolean);
	if (lastSets[0].length === 0 || firstCandidates.length === 0) return false;

	const lastOk = lastSets.some((set) => set.every((t) => otherTokens.includes(t)));
	const firstOk = firstCandidates.some((fc) =>
		normTokens(fc).some((t) => otherTokens.includes(t) || (NICKNAME_EQUIV[t] || []).some((alt) => otherTokens.includes(alt)))
	);
	return lastOk && firstOk;
}
