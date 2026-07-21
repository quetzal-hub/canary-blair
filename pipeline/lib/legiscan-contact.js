/**
 * CANARY BLAIR — LegiScan contact-field extraction
 *
 * LegiScan's person object (from getSessionPeople / getPerson / the bulk
 * dataset's people/*.json files) nests email, phone, and mailing address
 * under `bio`. Shared by bootstrap.js and sync.js so the two field mappings
 * can't drift apart.
 */

/** Prefers the capitol phone (near-universally populated); falls back to district phone. */
export function extractPhone(person) {
	const social = person?.bio?.social;
	return social?.capitol_phone || social?.district_phone || null;
}

export function extractEmail(person) {
	return person?.bio?.social?.email || null;
}

/** Formats LegiScan's capitol_address object into one display-ready string, or null if absent. */
export function formatCapitolAddress(person) {
	const addr = person?.bio?.capitol_address;
	if (!addr?.address1) return null;
	const line2 = addr.address2 ? `, ${addr.address2}` : '';
	const cityStateZip = [addr.city, addr.state].filter(Boolean).join(', ') + (addr.zip ? ` ${addr.zip}` : '');
	return `${addr.address1}${line2}, ${cityStateZip}`;
}
