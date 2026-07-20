import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { STATE_CONFIG } from '$stateConfig';

const CENSUS_ADDRESS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/address';
const CENSUS_COORDS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const CENSUS_LAYERS = 'State Legislative Districts - Lower,State Legislative Districts - Upper';
const CENSUS_PARAMS = {
	benchmark: 'Public_AR_Current',
	vintage: 'Current_Current',
	layers: CENSUS_LAYERS,
	format: 'json'
};

/**
 * Strategy:
 * 1. If street address provided → Census geocoder (exact district match)
 * 2. If only city/zip → Nominatim for lat/lng → Census coordinates endpoint
 *    (approximate — uses city center, but usually correct for smaller WV towns)
 */

async function lookupByAddress(street, city, zip) {
	const params = new URLSearchParams({
		street, city, state: STATE_CONFIG.code, zip, ...CENSUS_PARAMS
	});
	const res = await fetch(`${CENSUS_ADDRESS_URL}?${params}`);
	if (!res.ok) return null;
	const data = await res.json();
	const match = data.result?.addressMatches?.[0];
	if (!match) return null;
	return {
		geos: match.geographies,
		displayAddress: match.matchedAddress,
		approximate: false
	};
}

async function lookupByCityZip(city, zip) {
	// Step 1: Geocode city/zip to coordinates via Nominatim
	const searchParams = new URLSearchParams({
		state: STATE_CONFIG.name,
		country: 'US',
		format: 'json',
		limit: '1'
	});
	if (city) searchParams.set('city', city);
	if (zip) searchParams.set('postalcode', zip);

	const geoRes = await fetch(`${NOMINATIM_URL}?${searchParams}`, {
		headers: { 'User-Agent': 'CanaryBlair/1.0 (civic accountability tool)' }
	});
	if (!geoRes.ok) return null;
	let geoData = await geoRes.json();

	// Nominatim structured search can fail with state + postalcode but no city.
	// Retry without state so zip-only lookups still work.
	if (!geoData.length && zip && !city) {
		const fallbackParams = new URLSearchParams({
			postalcode: zip,
			country: 'US',
			format: 'json',
			limit: '1'
		});
		const fallbackRes = await fetch(`${NOMINATIM_URL}?${fallbackParams}`, {
			headers: { 'User-Agent': 'CanaryBlair/1.0 (civic accountability tool)' }
		});
		if (fallbackRes.ok) geoData = await fallbackRes.json();
	}
	if (!geoData.length) return null;

	const { lat, lon, display_name } = geoData[0];

	// Step 2: Census coordinates → districts
	const params = new URLSearchParams({
		x: lon, y: lat, ...CENSUS_PARAMS
	});
	const res = await fetch(`${CENSUS_COORDS_URL}?${params}`);
	if (!res.ok) return null;
	const data = await res.json();
	return {
		geos: data.result?.geographies,
		displayAddress: display_name,
		approximate: true
	};
}

function extractDistricts(geos) {
	const lower = geos?.['2024 State Legislative Districts - Lower']?.[0];
	const upper = geos?.['2024 State Legislative Districts - Upper']?.[0];
	return {
		houseDistrict: lower?.SLDL ? `HD-${lower.SLDL}` : null,
		senateDistrict: upper?.SLDU ? `SD-${upper.SLDU}` : null,
		houseLabel: lower?.NAME || null,
		senateLabel: upper?.NAME || null
	};
}

// Best-effort in-isolate cache of the (static) address → districts geocoding
// step, so a burst of identical lookups hits the external Census/Nominatim APIs
// only once. This protects us from getting rate-limited/IP-blocked by those
// services under load. Member data is always fetched fresh below, so scores
// never go stale. Hard rate limiting is best done at the edge via Cloudflare's
// WAF/rate-limiting rules — this is defense in depth, not the whole story.
const GEO_TTL_MS = 1000 * 60 * 60 * 24; // districts for an address don't change day to day
const geoCache = new Map();

async function resolveDistricts(street, city, zip) {
	const key = `${street}|${city}|${zip}`.toLowerCase().trim();
	const hit = geoCache.get(key);
	if (hit && Date.now() - hit.at < GEO_TTL_MS) return hit.value;

	let result;
	if (street) {
		result = await lookupByAddress(street, city, zip);
		if (!result) result = await lookupByCityZip(city || '', zip || ''); // fallback
	} else {
		result = await lookupByCityZip(city, zip);
	}

	if (result) {
		if (geoCache.size > 1000) geoCache.clear(); // crude unbounded-growth guard
		geoCache.set(key, { at: Date.now(), value: result });
	}
	return result;
}

export async function load({ url, setHeaders }) {
	const street = url.searchParams.get('street') || '';
	const city = url.searchParams.get('city') || '';
	const zip = url.searchParams.get('zip') || '';

	if (!street && !city && !zip) {
		return { members: null, address: null, error: null };
	}

	try {
		const result = await resolveDistricts(street, city, zip);

		if (!result) {
			return { members: null, address: null, error: `No matching location found in ${STATE_CONFIG.name}. Check your spelling and try again.` };
		}

		const { houseDistrict, senateDistrict, houseLabel, senateLabel } = extractDistricts(result.geos);

		if (!houseDistrict && !senateDistrict) {
			return { members: null, address: result.displayAddress, error: 'Location found but no legislative districts returned. Try adding a street address for more accuracy.' };
		}

		// Fetch matching members
		const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const districts = [houseDistrict, senateDistrict].filter(Boolean);

		const { data: members } = await supabase
			.from('members')
			.select('id, full_name, party, chamber, district, photo_url, canary_score, canary_tier, canary_badges, canary_votes_scored, next_election')
			.in('district', districts);

		// Let the edge cache absorb repeated identical lookups for a short window.
		// Short enough that weekly score updates still show through quickly.
		setHeaders({ 'cache-control': 'public, max-age=900' });

		return {
			members: members || [],
			address: result.displayAddress,
			houseDistrict: houseLabel || houseDistrict,
			senateDistrict: senateLabel || senateDistrict,
			approximate: result.approximate,
			error: null
		};
	} catch {
		return { members: null, address: null, error: 'Something went wrong looking up your location. Please try again.' };
	}
}
