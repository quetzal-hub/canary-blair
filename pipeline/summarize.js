/**
 * CANARY BLAIR — Smart AI Summarization
 *
 * Summarizes bills using Claude. Cost-optimized:
 *   - Summarizes active + passed bills (status 1-4) by default
 *   - Uses Haiku for bulk, keeps costs near zero
 *   - Skips bills that already have a summary (unless --force)
 *   - Can target only voted-on bills with --voted-only
 *   - Can target specific bills with --bill-id=12345
 *
 * Usage:
 *   node pipeline/summarize.js                    # active + passed bills
 *   node pipeline/summarize.js --all              # ALL bills regardless of status
 *   node pipeline/summarize.js --voted-only       # only bills with roll call votes
 *   node pipeline/summarize.js --exclude-passed   # active only (no passed)
 *   node pipeline/summarize.js --force            # re-summarize everything
 *   node pipeline/summarize.js --text-changed     # re-summarize bills whose text URL changed
 *   node pipeline/summarize.js --backfill-tiers   # only bills with summary but no impact tier
 *   node pipeline/summarize.js --bill-id=12345    # single bill
 *   node pipeline/summarize.js --limit=50         # cap at 50 bills
 */
import 'dotenv/config';

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing required environment variables.');
	console.error('   Ensure ANTHROPIC_API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_KEY are set in .env');
	process.exit(1);
}

// Haiku for bulk summarization — fast and cheap
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1000;

// ─────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────

const args = process.argv.slice(2);
const force = args.includes('--force');
const allBills = args.includes('--all');
const excludePassed = args.includes('--exclude-passed');
const votedOnly = args.includes('--voted-only');
const backfillTiers = args.includes('--backfill-tiers');
const textChanged = args.includes('--text-changed');
const billIdArg = args.find((a) => a.startsWith('--bill-id='));
const limitArg = args.find((a) => a.startsWith('--limit='));
const targetBillId = billIdArg ? parseInt(billIdArg.split('=')[1]) : null;
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

// ─────────────────────────────────────────
// SUPABASE HELPERS
// ─────────────────────────────────────────

async function supabaseFetch(path, filter = '') {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${filter ? '?' + filter : ''}`, {
		headers: {
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY
		}
	});
	if (!res.ok) throw new Error(`DB fetch error: ${path}`);
	return res.json();
}

async function supabaseFetchAll(path, filter = '') {
	const rows = [];
	let offset = 0;
	const pageSize = 1000;
	while (true) {
		const sep = filter ? '&' : '';
		const batch = await supabaseFetch(path, `${filter}${sep}offset=${offset}&limit=${pageSize}`);
		rows.push(...batch);
		if (batch.length < pageSize) break;
		offset += pageSize;
	}
	return rows;
}

async function supabasePatch(table, id, data) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			apikey: SUPABASE_SERVICE_KEY,
			Prefer: 'return=minimal'
		},
		body: JSON.stringify(data)
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Patch ${table} error: ${err}`);
	}
}

// ─────────────────────────────────────────
// CLAUDE API
// ─────────────────────────────────────────

async function callClaude(prompt) {
	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: MAX_TOKENS,
			messages: [{ role: 'user', content: prompt }]
		})
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Claude API error ${res.status}: ${err}`);
	}
	const data = await res.json();
	return data.content[0].text;
}

// ─────────────────────────────────────────
// BILL TEXT FETCHING
// ─────────────────────────────────────────

async function fetchBillText(url) {
	if (!url) return null;
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'CanaryBlair/1.0 (civic accountability tool)' }
		});
		if (!res.ok) return null;
		const html = await res.text();

		// Strip HTML tags, decode entities, collapse whitespace
		let text = html
			.replace(/<script[\s\S]*?<\/script>/gi, '')
			.replace(/<style[\s\S]*?<\/style>/gi, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#?\w+;/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		// Cap at ~15,000 chars to keep costs reasonable while capturing full text of most bills
		if (text.length > 15000) {
			text = text.slice(0, 15000) + '\n\n[Text truncated — bill exceeds 15,000 characters]';
		}

		return text.length > 100 ? text : null; // Skip if too short (probably an error page)
	} catch {
		return null;
	}
}

// ─────────────────────────────────────────
// PROMPT
// ─────────────────────────────────────────

function buildPrompt(bill, sponsors, billText) {
	const textSection = billText
		? `\nFull Bill Text:\n${billText}`
		: `\nDescription: ${bill.description || 'No description available.'}`;

	return `You are Canary Blair — a civic accountability tool for West Virginia residents.
Your job is to translate government legislation into plain, honest language that any
West Virginia resident can understand, regardless of education level.

Be direct. Be clear. Be unflinching. Don't soften corporate or political interests.
Don't editorialize — just explain what is actually happening.

IMPORTANT: When analyzing who is hurt, consider ALL impacts — environmental damage,
reduced oversight, weakened protections, lost public input, health risks, pollution,
water contamination, worker safety, etc. A bill that reduces environmental regulation
HURTS the environment and the people who depend on clean air and water — say so clearly.
Do not bury environmental or public health harms in vague language.

Here is a West Virginia bill:

Bill Number: ${bill.bill_number}
Title: ${bill.title}
Status: ${bill.status_text}
Sponsors: ${sponsors.length ? sponsors.join(', ') : 'Unknown'}
${textSection}

Respond ONLY with a JSON object. No preamble, no markdown fences.
{
  "summary": "2-4 sentence plain language explanation of what this bill does. Write for a 10th grade reading level. Be concrete and specific.",
  "critical_points": ["Array of up to 10 bullet points highlighting key provisions, dollar amounts, deadlines, thresholds, exemptions, and other concrete details from the bill. Each bullet should be one clear sentence. For short bills, fewer points are fine — aim for 10 on longer bills."],
  "who_benefits": "1-3 sentences. Who gains from this bill passing? Be specific — name industries, groups, or interests when relevant.",
  "who_is_hurt": "1-3 sentences. Who loses or bears costs if this passes? Consider environmental harm, reduced oversight, public health risks, lost worker protections, and community impacts. If no one is clearly hurt, say so honestly.",
  "alignment": "One of: 'for_people' (primarily benefits ordinary WV residents, workers, communities, environment, public health), 'for_capital' (primarily benefits corporations, extractive industries, developers, or reduces protections for people/environment), or 'neutral' (purely procedural, administrative, or genuinely balanced). A bill that WEAKENS environmental or worker protections is 'for_capital' even if it is tagged with environment or worker topics.",
  "impact_tier": "Integer 1-6 rating how consequential this bill is. This is INDEPENDENT of alignment — it measures magnitude of real-world impact, not direction. 1 = LANDMARK: Transformative structural change affecting thousands of WV residents (e.g. gutting clean water protections statewide, major healthcare expansion, sweeping education overhaul). 2 = HIGH IMPACT: Significant real-world consequences for communities, health, environment, or livelihoods (e.g. weakening mine safety rules, expanding Medicaid eligibility, major tax shifts). 3 = MEANINGFUL: Clear benefit or harm but narrower scope — affects a specific group, region, or sector (e.g. teacher pay raise, single-industry regulation change). 4 = ROUTINE: Standard legislation with modest impact (e.g. updating licensing requirements, adjusting administrative procedures). 5 = MINOR: Small procedural tweaks, technical amendments, or housekeeping changes. 6 = CEREMONIAL: Resolutions, namings, commemorations, symbolic acts with no policy impact. Be honest — most bills are tier 3-5. Reserve tier 1 for bills that would fundamentally change how West Virginia works. A bill that touches water, environment, or public health in a state with known contamination problems should be weighted MORE seriously.",
  "tags": ["array", "of", "topic", "tags"]
}

Available tags (use only relevant ones, can add your own):
water, education, healthcare, environment, coal, energy, corporations, taxes, workers,
public-safety, guns, religion, voting-rights, housing, infrastructure, agriculture,
local-government, budget, criminal-justice, civil-rights, family, children, elderly`.trim();
}

// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────

async function run() {
	const startTime = Date.now();
	console.log('🤖 Canary Blair AI Summarization\n');
	console.log(`   Model: ${MODEL}`);
	console.log(`   Force re-summarize: ${force}`);
	console.log(`   Include passed: ${!excludePassed}`);
	console.log(`   Voted-only: ${votedOnly}`);
	if (targetBillId) console.log(`   Target bill: ${targetBillId}`);
	if (limit) console.log(`   Limit: ${limit}`);
	console.log('');

	// ── Fetch bills to summarize ──────
	let bills;

	if (targetBillId) {
		let filter = 'select=id,bill_number,title,description,status,status_text,ai_summary,bill_text_url';
		filter += `&id=eq.${targetBillId}`;
		bills = await supabaseFetch('bills', filter);
	} else if (backfillTiers) {
		// Bills that have a summary but no impact tier
		let filter = 'select=id,bill_number,title,description,status,status_text,ai_summary,bill_text_url';
		filter += '&ai_summary=not.is.null&ai_impact_tier=is.null';
		filter += '&order=last_action_date.desc';
		if (limit) filter += `&limit=${limit}`;
		bills = await supabaseFetch('bills', filter);
		console.log(`   Found ${bills.length} bills with summary but no impact tier`);
	} else if (votedOnly) {
		// Only bills that have roll call votes — the ones that matter for scoring
		const rollCalls = await supabaseFetch('roll_calls', 'select=bill_id');
		const votedBillIds = [...new Set(rollCalls.map(r => r.bill_id))];
		console.log(`   Found ${votedBillIds.length} bills with roll call votes`);

		// Fetch those bills
		let allVotedBills = [];
		// Supabase has URL length limits, so batch the IDs
		for (let i = 0; i < votedBillIds.length; i += 100) {
			const batch = votedBillIds.slice(i, i + 100);
			let filter = 'select=id,bill_number,title,description,status,status_text,ai_summary,bill_text_url';
			filter += `&id=in.(${batch.join(',')})`;
			if (!force) filter += '&ai_summary=is.null';
			filter += '&order=last_action_date.desc';
			const batchBills = await supabaseFetch('bills', filter);
			allVotedBills.push(...batchBills);
		}
		bills = limit ? allVotedBills.slice(0, limit) : allVotedBills;
	} else if (textChanged) {
		// Bills where bill_text_url has changed since last summary
		// Fetches all summarized bills and filters client-side (PostgREST can't do col!=col)
		let filter = 'select=id,bill_number,title,description,status,status_text,ai_summary,bill_text_url,ai_summary_text_url';
		filter += '&ai_summary=not.is.null';
		filter += '&order=last_action_date.desc';
		const allSummarized = await supabaseFetchAll('bills', filter);
		bills = allSummarized.filter(b =>
			b.bill_text_url && b.bill_text_url !== b.ai_summary_text_url
		);
		if (limit) bills = bills.slice(0, limit);
		console.log(`   Found ${bills.length} bills where text URL changed since last summary`);
	} else if (allBills) {
		// All bills regardless of status — paginated to get past 1000-row limit
		let filter = 'select=id,bill_number,title,description,status,status_text,ai_summary,bill_text_url';
		if (!force) {
			filter += '&ai_summary=is.null';
		}
		filter += '&order=last_action_date.desc';
		if (limit) {
			filter += `&limit=${limit}`;
			bills = await supabaseFetch('bills', filter);
		} else {
			bills = await supabaseFetchAll('bills', filter);
		}
	} else {
		// Default: active + passed bills (status 1-4)
		const statuses = excludePassed ? [1, 2, 3] : [1, 2, 3, 4];
		let filter = 'select=id,bill_number,title,description,status,status_text,ai_summary,bill_text_url';
		filter += `&status=in.(${statuses.join(',')})`;

		if (!force) {
			filter += '&ai_summary=is.null';
		}

		filter += '&order=last_action_date.desc';

		if (limit) {
			filter += `&limit=${limit}`;
		}
		bills = await supabaseFetch('bills', filter);
	}
	console.log(`📋 Found ${bills.length} bills to summarize\n`);

	if (bills.length === 0) {
		console.log('Nothing to do!');
		return;
	}

	let success = 0;
	let failed = 0;

	for (let i = 0; i < bills.length; i++) {
		const bill = bills[i];

		try {
			// Fetch sponsor names
			const sponsors = await supabaseFetch(
				'bill_sponsors',
				`select=members(full_name)&bill_id=eq.${bill.id}`
			);
			const sponsorNames = sponsors
				.map((s) => s.members?.full_name)
				.filter(Boolean);

			// Fetch full bill text from WV Legislature website
			const billText = await fetchBillText(bill.bill_text_url);
			if (!billText) {
				console.log(`   ⚠ [${i + 1}/${bills.length}] ${bill.bill_number}: No bill text available, using description only`);
			}

			const prompt = buildPrompt(bill, sponsorNames, billText);
			const response = await callClaude(prompt);

			// Parse JSON response
			let parsed;
			try {
				parsed = JSON.parse(response);
			} catch {
				const match = response.match(/\{[\s\S]*\}/);
				if (match) parsed = JSON.parse(match[0]);
				else throw new Error('Could not parse AI response as JSON');
			}

			// Write to database
			const impactTier = parseInt(parsed.impact_tier);
			await supabasePatch('bills', bill.id, {
				ai_summary: parsed.summary,
				ai_critical_points: `{${(parsed.critical_points || []).map(p => '"' + p.replace(/"/g, '\\"') + '"').join(',')}}`,
				ai_who_benefits: parsed.who_benefits,
				ai_who_is_hurt: parsed.who_is_hurt,
				ai_alignment: parsed.alignment || null,
				ai_impact_tier: (impactTier >= 1 && impactTier <= 6) ? impactTier : 4,
				ai_tags: `{${(parsed.tags || []).join(',')}}`,
				ai_summary_updated_at: new Date().toISOString(),
				ai_summary_text_url: bill.bill_text_url || null
			});

			success++;
			console.log(`   ✅ [${i + 1}/${bills.length}] ${bill.bill_number}: ${bill.title.slice(0, 60)}...`);

			// Small delay between calls to be kind to the API
			if (i < bills.length - 1) {
				await new Promise((r) => setTimeout(r, 150));
			}
		} catch (err) {
			failed++;
			console.error(`   ❌ [${i + 1}/${bills.length}] ${bill.bill_number}: ${err.message}`);
		}
	}

	const duration = Date.now() - startTime;
	const mins = Math.floor(duration / 60000);
	const secs = Math.floor((duration % 60000) / 1000);

	console.log('\n═══════════════════════════════════════');
	console.log('✅ Summarization complete!');
	console.log(`   Summarized: ${success}`);
	console.log(`   Failed:     ${failed}`);
	console.log(`   Duration:   ${mins}m ${secs}s`);
	console.log('═══════════════════════════════════════');
}

run().catch((err) => {
	console.error('\n❌ Summarization failed:', err.message);
	process.exit(1);
});
