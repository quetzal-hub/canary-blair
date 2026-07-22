/**
 * CANARY BLAIR — statewide officials seed
 *
 * Seeds the officials table (schema/018) with West Virginia's statewide
 * elected officials. Every officeholder below was verified against their
 * office's own official state website on 2026-07-21 (sources in comments) —
 * none of this is from memory or third-party data.
 *
 * party is left null wherever no checked source confirmed it: Morrisey,
 * McCuskey, and Pack showed as Republican in FollowTheMoney's 2024 winner
 * data (pulled directly during the finance-eid work); Warner/Hunt/Leonhardt
 * weren't in the sample we saw, so they stay null until confirmed. WV
 * Supreme Court elections are nonpartisan by law — justices' party is null
 * by design, not missing data.
 *
 * followthemoney_eid values for Morrisey/McCuskey/Pack come from the same
 * FTM pull (Candidate_Entity c-t-eid tags observed directly).
 *
 * Idempotent upsert on slug. Dry-run by default; --commit to write.
 *
 * Usage:
 *   node pipeline/officials-seed.js            # dry run
 *   node pipeline/officials-seed.js --commit   # write
 */
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const COMMIT = process.argv.includes('--commit');

const OFFICIALS = [
	// ── Executive (Board of Public Works) ──────────────────────
	{
		slug: 'governor',
		office: 'Governor',
		office_group: 'executive',
		full_name: 'Patrick Morrisey',       // governor.wv.gov: "Patrick James Morrisey ... took office on January 13, 2025"
		party: 'R',                           // FollowTheMoney 2024: MORRISEY, PATRICK — Republican, Won-General
		photo_url: 'https://www.wv.gov/sites/default/files/2024-12/morrissey.jpg', // from governor.wv.gov
		website: 'https://governor.wv.gov/',
		term_start: 2025,
		next_election: 2028,
		followthemoney_eid: 6700824           // FTM Candidate_Entity c-t-eid, observed directly
	},
	{
		slug: 'attorney-general',
		office: 'Attorney General',
		office_group: 'executive',
		full_name: 'John B. McCuskey',        // ago.wv.gov
		party: 'R',                           // FollowTheMoney 2024: MCCUSKEY, JOHN — Republican, Won-General
		website: 'https://ago.wv.gov/',
		term_start: 2025,
		next_election: 2028,
		followthemoney_eid: 59685131          // FTM Candidate_Entity c-t-eid, observed directly
	},
	{
		slug: 'secretary-of-state',
		office: 'Secretary of State',
		office_group: 'executive',
		full_name: 'Kris Warner',             // sos.wv.gov
		party: null,                          // not confirmed by a checked source yet
		website: 'https://sos.wv.gov/',
		term_start: 2025,
		next_election: 2028
	},
	{
		slug: 'auditor',
		office: 'State Auditor',
		office_group: 'executive',
		full_name: 'Mark A. Hunt',            // wvsao.gov
		party: null,
		website: 'https://www.wvsao.gov/',
		term_start: 2025,
		next_election: 2028
	},
	{
		slug: 'treasurer',
		office: 'State Treasurer',
		office_group: 'executive',
		full_name: 'Larry Pack',              // wvtreasury.gov
		party: 'R',                           // FollowTheMoney 2024: PACK SR, LAWRENCE A (LARRY) — Republican, Default Winner-General
		website: 'https://wvtreasury.gov/',
		term_start: 2025,
		next_election: 2028,
		followthemoney_eid: 7555327           // FTM Candidate_Entity c-t-eid, observed directly
	},
	{
		slug: 'agriculture-commissioner',
		office: 'Commissioner of Agriculture',
		office_group: 'executive',
		full_name: 'Kent Leonhardt',          // agriculture.wv.gov
		party: null,
		photo_url: 'https://agriculture.wv.gov/wp-content/uploads/Kent-Photo-240x300-1.jpg',
		website: 'https://agriculture.wv.gov/',
		term_start: 2025,
		next_election: 2028
	},

	// ── Judicial (Supreme Court of Appeals — elected, nonpartisan) ──
	// All five verified at courtswv.gov/appellate-courts/supreme-court-of-appeals/justices-staff.
	// Terms are 12 years, staggered — term_start/next_election left null rather than guessed.
	{ slug: 'justice-bunn', office: 'Chief Justice, Supreme Court of Appeals', office_group: 'judicial', full_name: 'C. Haley Bunn', party: null, website: 'https://www.courtswv.gov/appellate-courts/supreme-court-of-appeals/justices-staff' },
	{ slug: 'justice-wooton', office: 'Justice, Supreme Court of Appeals', office_group: 'judicial', full_name: 'William R. Wooton', party: null, website: 'https://www.courtswv.gov/appellate-courts/supreme-court-of-appeals/justices-staff' },
	{ slug: 'justice-trump', office: 'Justice, Supreme Court of Appeals', office_group: 'judicial', full_name: 'Charles S. Trump IV', party: null, website: 'https://www.courtswv.gov/appellate-courts/supreme-court-of-appeals/justices-staff' },
	{ slug: 'justice-kirkpatrick', office: 'Justice, Supreme Court of Appeals', office_group: 'judicial', full_name: 'H.L. Kirkpatrick', party: null, website: 'https://www.courtswv.gov/appellate-courts/supreme-court-of-appeals/justices-staff' },
	{ slug: 'justice-flanigan', office: 'Justice, Supreme Court of Appeals', office_group: 'judicial', full_name: 'James W. Flanigan', party: null, website: 'https://www.courtswv.gov/appellate-courts/supreme-court-of-appeals/justices-staff' }
];

async function run() {
	console.log(`🏛️  Officials seed — ${COMMIT ? 'COMMIT (writing to DB)' : 'DRY RUN (no writes)'}\n`);

	for (const o of OFFICIALS) {
		console.log(`   ${COMMIT ? '→' : 'would upsert'} ${o.office}: ${o.full_name}${o.party ? ` (${o.party})` : ''}`);
	}

	if (!COMMIT) {
		console.log(`\nDry run — ${OFFICIALS.length} officials. Run with --commit to write.`);
		return;
	}

	const res = await fetch(`${SUPABASE_URL}/rest/v1/officials?on_conflict=slug`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY,
			Prefer: 'resolution=merge-duplicates,return=minimal'
		},
		body: JSON.stringify(OFFICIALS.map((o) => ({ ...o, is_current: true, updated_at: new Date().toISOString() })))
	});
	if (!res.ok) throw new Error(`Upsert officials: ${await res.text()}`);
	console.log(`\n✅ Seeded ${OFFICIALS.length} officials.`);
}

run().catch((err) => {
	console.error('\n❌ Seed failed:', err.message);
	process.exit(1);
});
