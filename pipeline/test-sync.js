/**
 * Local test runner for the sync pipeline.
 * Loads .env, instantiates SyncEngine, runs engine.run()
 *
 * Usage: node pipeline/test-sync.js
 */
import 'dotenv/config';
import { SyncEngine } from './sync.js';

const engine = new SyncEngine({
	LEGISCAN_API_KEY: process.env.LEGISCAN_API_KEY,
	SUPABASE_URL: process.env.SUPABASE_URL,
	SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
	AI_QUEUE_URL: null // skip AI during initial sync test
});

engine
	.run()
	.then(() => console.log('Done'))
	.catch(console.error);
