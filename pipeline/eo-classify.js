/**
 * CANARY BLAIR — Executive Order classification
 *
 * Scrapes the Governor's executive orders (governor.wv.gov → SoS executive
 * journal PDFs) and classifies each with the same for_people/for_capital +
 * impact-tier framework used for bills — by feeding the actual PDF to Claude
 * as a document block, so the classification is grounded in the full order,
 * not just its title.
 *
 * An executive order is the Governor's unilateral act — no legislature to
 * share credit or blame — so these feed his Canary Score as his own
 * initiative (see governor-score.js / lib/governor-scoring.js).
 *
 * Dry-run by default; --commit to write. Skips EOs already classified unless
 * --force.
 *
 * Usage:
 *   node pipeline/eo-classify.js            # dry run
 *   node pipeline/eo-classify.js --commit   # classify + write
 *   node pipeline/eo-classify.js --commit --force   # re-classify all
 */
import 'dotenv/config';
import { STATE_CONFIG } from './lib/state-config.js';
import { CLAUDE_MODEL, THINKING_ADAPTIVE, extractText } from './lib/ai-config.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing ANTHROPIC_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_KEY in .env');
	process.exit(1);
}

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const FORCE = args.includes('--force');

const EO_INDEX_URL = 'https://governor.wv.gov/executive-orders';

function dbHeaders(extra = {}) {
	return { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY, ...extra };
}

/** Scrape the EO index → [{ number, pdfUrl, title, date }]. */
async function scrapeEOList() {
	const html = await (await fetch(EO_INDEX_URL)).text();

	// Anchor links give the reliable number + PDF DocID URL.
	const anchors = [...html.matchAll(/<a[^>]+href="(https:\/\/apps\.sos\.wv\.gov\/adlaw\/executivejournal\/readpdf\.aspx\?DocID=\d+)"[^>]*>\s*Executive Order (\d+-\d+)/gi)];

	// Titles + dates from the meta description ("Executive Order N-25: Title (M/D/YYYY)...").
	const desc = (html.match(/meta name="description" content="([^"]+)"/) || [])[1] || '';
	const titleByNum = new Map();
	for (const m of desc.matchAll(/Executive Order (\d+-\d+):\s*([^(]+?)\s*\((\d{1,2}\/\d{1,2}\/\d{4})\)/g)) {
		titleByNum.set(m[1], { title: m[2].trim(), date: m[3] });
	}

	const seen = new Set();
	const list = [];
	for (const a of anchors) {
		const number = a[2];
		if (seen.has(number)) continue;
		seen.add(number);
		const meta = titleByNum.get(number) || {};
		list.push({ number, pdfUrl: a[1], title: meta.title || null, date: meta.date || null });
	}
	return list;
}

function toISODate(mdy) {
	if (!mdy) return null;
	const [m, d, y] = mdy.split('/');
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const EO_PROMPT = `You are Canary Blair — a civic accountability tool for ${STATE_CONFIG.name} residents.
Classify this EXECUTIVE ORDER, issued unilaterally by the Governor. Same standard as legislation:
judge what the order actually DOES, grounded in evidence and documented effects, not its framing or
title. Religious or moral approval is not evidence of benefit; ground harms/benefits in measurable,
documented effects and outcomes in comparable states. Extractive/fossil interests (${STATE_CONFIG.extractiveIndustries})
are capital. ${STATE_CONFIG.energyGuidance} ${STATE_CONFIG.localStakesNote}.

Respond ONLY with a JSON object, no preamble, no markdown fences:
{
  "title": "the order's actual subject in a short phrase",
  "summary": "2-4 plain-language sentences on what this order does, 10th-grade reading level",
  "who_benefits": "1-3 sentences — who gains, named specifically",
  "who_is_hurt": "1-3 sentences — who loses or bears costs; if no one, say so honestly",
  "reasoning": "1-2 sentences naming the concrete mechanism behind the alignment call",
  "alignment": "'for_people' (benefits ordinary ${STATE_CONFIG.demonym}, workers, communities, environment, public health) | 'for_capital' (benefits corporations, extractive industries, or reduces protections for people/environment) | 'neutral' (purely administrative/procedural or genuinely balanced)",
  "impact_tier": "integer 1-6: 1=Landmark statewide structural change, 2=High impact, 3=Meaningful narrower scope, 4=Routine, 5=Minor, 6=Ceremonial",
  "tags": ["topic","tags"],
  "confidence": "'high' | 'medium' | 'low' — honest confidence in the alignment call"
}`;

async function classifyPDF(pdfUrl) {
	const bytes = await (await fetch(pdfUrl)).arrayBuffer();
	const b64 = Buffer.from(bytes).toString('base64');

	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
		body: JSON.stringify({
			model: CLAUDE_MODEL,
			max_tokens: 4000,
			thinking: THINKING_ADAPTIVE,
			messages: [{
				role: 'user',
				content: [
					{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
					{ type: 'text', text: EO_PROMPT }
				]
			}]
		})
	});
	if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const text = extractText(await res.json());
	try {
		return JSON.parse(text);
	} catch {
		const m = text.match(/\{[\s\S]*\}/);
		if (m) return JSON.parse(m[0]);
		throw new Error('could not parse EO classification as JSON');
	}
}

async function existingNumbers() {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/executive_orders?select=eo_number,ai_alignment`, { headers: dbHeaders() });
	if (!res.ok) return new Map();
	const map = new Map();
	for (const r of await res.json()) map.set(r.eo_number, r.ai_alignment);
	return map;
}

async function run() {
	console.log(`🖋️  Executive Order classification — ${COMMIT ? 'COMMIT' : 'DRY RUN'}${FORCE ? ' (force)' : ''}\n`);
	const list = await scrapeEOList();
	console.log(`Found ${list.length} executive orders on the index.\n`);

	const existing = await existingNumbers();

	for (const eo of list) {
		if (!FORCE && existing.get(eo.number)) {
			console.log(`  · EO ${eo.number} already classified (${existing.get(eo.number)}) — skipping`);
			continue;
		}
		try {
			const c = await classifyPDF(eo.pdfUrl);
			const tier = parseInt(c.impact_tier);
			const row = {
				eo_number: eo.number,
				eo_date: toISODate(eo.date),
				title: c.title || eo.title || `Executive Order ${eo.number}`,
				pdf_url: eo.pdfUrl,
				ai_summary: c.summary || null,
				ai_who_benefits: c.who_benefits || null,
				ai_who_is_hurt: c.who_is_hurt || null,
				ai_reasoning: c.reasoning || null,
				ai_alignment: c.alignment || null,
				ai_impact_tier: tier >= 1 && tier <= 6 ? tier : 4,
				ai_confidence: ['high', 'medium', 'low'].includes(c.confidence) ? c.confidence : null,
				ai_tags: Array.isArray(c.tags) ? c.tags : [],
				updated_at: new Date().toISOString()
			};
			console.log(`  ${COMMIT ? '✅' : '›'} EO ${eo.number}: ${row.title.slice(0, 50)} → ${row.ai_alignment} tier ${row.ai_impact_tier} (${row.ai_confidence})`);
			if (COMMIT) {
				const res = await fetch(`${SUPABASE_URL}/rest/v1/executive_orders?on_conflict=eo_number`, {
					method: 'POST',
					headers: dbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
					body: JSON.stringify(row)
				});
				if (!res.ok) throw new Error(`write: ${await res.text()}`);
			}
			await new Promise((r) => setTimeout(r, 300));
		} catch (err) {
			console.error(`  ✗ EO ${eo.number}: ${err.message}`);
		}
	}

	if (!COMMIT) console.log('\nDry run — run with --commit to write.');
}

run().catch((err) => {
	console.error('\n❌ EO classification failed:', err.message);
	process.exit(1);
});
