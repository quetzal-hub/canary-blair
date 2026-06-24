/**
 * Local test runner for the AI worker.
 * Loads .env, instantiates AIWorker, tests individual tasks.
 *
 * Usage:
 *   node pipeline/test-ai.js summarize    # summarize 5 unsummarized bills
 *   node pipeline/test-ai.js score        # recalculate all Canary Scores
 *   node pipeline/test-ai.js profiles     # regenerate all member profiles
 *   node pipeline/test-ai.js all          # summarize → score → profiles
 */
import 'dotenv/config';
import { AIWorker } from './ai-worker.js';

const worker = new AIWorker({
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	SUPABASE_URL: process.env.SUPABASE_URL,
	SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
});

const task = process.argv[2] || 'summarize';

if (task === 'summarize' || task === 'all') {
	const bills = await worker.dbFetch('bills', 'select=id&ai_summary=is.null&limit=5');

	if (!bills?.length) {
		console.log('No unsummarized bills found.');
	} else {
		console.log(`Testing summarization on ${bills.length} bills...`);
		await worker.summarizeBills(bills.map((b) => b.id));
	}
}

if (task === 'score' || task === 'all') {
	console.log('\nRunning Canary Score calculation...');
	await worker.calculateScores();
}

if (task === 'profiles' || task === 'all') {
	console.log('\nRegenerating member profiles...');
	await worker.refreshAllMemberProfiles();
}

console.log('\nDone');
