/**
 * CANARY BLAIR — LegiScan Sync Pipeline
 * 
 * Runs as a Cloudflare Worker (cron trigger, daily)
 * or as a plain Node.js script for local testing.
 * 
 * Strategy: change_hash delta sync
 *   1. Fetch master list for current WV session
 *   2. Compare change_hash per bill against our DB
 *   3. Only fetch full bill details for changed/new bills
 *   4. Fetch roll calls and votes for any updated bills
 *   5. Queue changed bills for AI summarization
 * 
 * This keeps query usage well within the 30k/month free tier.
 */

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
import { STATE_CONFIG, nextLowerChamberElectionYear } from './lib/state-config.js';

const CONFIG = {
  LEGISCAN_API_BASE: 'https://api.legiscan.com/',
  STATE: STATE_CONFIG.code,
  // Bill status codes from LegiScan
  STATUS: {
    1: 'Introduced',
    2: 'Engrossed',
    3: 'Enrolled',
    4: 'Passed',
    5: 'Vetoed',
    6: 'Failed/Dead',
  },
  // Vote value codes
  VOTE: {
    1: 'Yea',
    2: 'Nay',
    3: 'NV',
    4: 'Absent',
  },
};

// ─────────────────────────────────────────
// LEGISCAN API CLIENT
// ─────────────────────────────────────────
class LegiScanClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.queryCount = 0;
  }

  async _fetch(op, params = {}) {
    const url = new URL(CONFIG.LEGISCAN_API_BASE);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('op', op);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    this.queryCount++;
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`LegiScan HTTP ${res.status} on ${op}`);
    const data = await res.json();
    if (data.status === 'ERROR') {
      throw new Error(`LegiScan API error on ${op}: ${data.alert?.message}`);
    }
    return data;
  }

  /** Get all available sessions for WV */
  async getSessionList() {
    const data = await this._fetch('getSessionList', { state: CONFIG.STATE });
    return data.sessions;
  }

  /**
   * Get master bill list with change_hash per bill.
   * Use this for delta sync — only fetch bills whose hash changed.
   */
  async getMasterListRaw(sessionId) {
    const data = await this._fetch('getMasterListRaw', { id: sessionId });
    // Returns { masterlist: { <meta key>: { session_id, sine_die, ... — no bill_id },
    //                         "1": { bill_id, number, change_hash, ... }, ... }
    // The metadata entry's key isn't reliably "0" (seen as literal key "session" in
    // practice), so filter by the actual invariant we need — having a bill_id —
    // rather than assuming a specific key.
    const raw = data.masterlist;
    return Object.values(raw).filter((entry) => entry && entry.bill_id);
  }

  /** Get full bill detail including sponsors, history, text refs, roll calls */
  async getBill(billId) {
    const data = await this._fetch('getBill', { id: billId });
    return data.bill;
  }

  /** Get full text of a bill */
  async getBillText(docId) {
    const data = await this._fetch('getBillText', { id: docId });
    // text is base64 encoded
    return data.text;
  }

  /** Get roll call vote detail */
  async getRollCall(rollCallId) {
    const data = await this._fetch('getRollCall', { id: rollCallId });
    return data.roll_call;
  }

  /** Get person/member detail */
  async getPerson(peopleId) {
    const data = await this._fetch('getPerson', { id: peopleId });
    return data.person;
  }

  /** Get all legislators for a session */
  async getSessionPeople(sessionId) {
    const data = await this._fetch('getSessionPeople', { id: sessionId });
    return data.sessionpeople?.people ?? [];
  }
}

// ─────────────────────────────────────────
// SUPABASE DATABASE CLIENT (thin wrapper)
// ─────────────────────────────────────────
class DB {
  constructor(supabaseUrl, supabaseServiceKey) {
    this.url = supabaseUrl;
    this.key = supabaseServiceKey;
  }

  async query(sql, params = []) {
    const res = await fetch(`${this.url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.key}`,
        'apikey': this.key,
      },
      body: JSON.stringify({ query: sql, params }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DB error: ${err}`);
    }
    return res.json();
  }

  /** Upsert helper using Supabase REST API */
  async upsert(table, data, onConflict = 'id') {
    const url = `${this.url}/rest/v1/${table}?on_conflict=${onConflict}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.key}`,
        'apikey': this.key,
        'Prefer': `resolution=merge-duplicates,return=minimal`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upsert ${table} error: ${err}`);
    }
    return res;
  }

  /** Patch helper — updates rows matching a PostgREST filter */
  async patch(table, filter, data) {
    const res = await fetch(`${this.url}/rest/v1/${table}?${filter}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.key}`,
        'apikey': this.key,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Patch ${table} error: ${err}`);
    }
  }

  /** Insert helper — ignores duplicates (for append-only tables without unique constraints) */
  async insertIgnore(table, data) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.key}`,
        'apikey': this.key,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(data),
    });
    // 409 = conflict (already exists) — that's fine, skip it
    if (!res.ok && res.status !== 409) {
      const err = await res.text();
      throw new Error(`Insert ${table} error: ${err}`);
    }
  }

  /** Select helper */
  async select(table, filter = '') {
    const res = await fetch(`${this.url}/rest/v1/${table}${filter ? '?' + filter : ''}`, {
      headers: {
        'Authorization': `Bearer ${this.key}`,
        'apikey': this.key,
      },
    });
    if (!res.ok) throw new Error(`Select ${table} error`);
    return res.json();
  }

  /** Select all rows (paginated — Supabase caps at 1000 per request) */
  async selectAll(table, filter = '') {
    const rows = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const sep = filter ? '&' : '';
      const batch = await this.select(table, `${filter}${sep}offset=${offset}&limit=${pageSize}`);
      rows.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }
    return rows;
  }
}

// ─────────────────────────────────────────
// SYNC ENGINE
// ─────────────────────────────────────────
class SyncEngine {
  constructor(env) {
    this.legiscan = new LegiScanClient(env.LEGISCAN_API_KEY);
    this.db = new DB(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    this.aiQueueUrl = env.AI_QUEUE_URL; // optional: webhook to trigger AI summarization
    this.stats = {
      billsChecked: 0,
      billsUpdated: 0,
      billsNew: 0,
      votesAdded: 0,
      membersUpdated: 0,
    };
  }

  async run() {
    const startTime = Date.now();
    console.log('🐦 Canary Blair sync starting...');

    try {
      // 1. Get or create current session
      const session = await this.syncCurrentSession();
      console.log(`📋 Session: ${session.name} (${session.id})`);

      // 2. Sync all members for this session
      await this.syncMembers(session.id);

      // 3. Delta sync bills using change_hash
      const updatedBillIds = await this.syncBills(session);

      // 4. Sync roll calls + votes for updated bills
      for (const billId of updatedBillIds) {
        await this.syncVotesForBill(billId);
      }

      // 5. Archive expired bills if session has ended (sine die)
      if (session.sine_die) {
        await this.archiveExpiredBills(session.id);
      }

      // 6. Queue updated bills for AI summarization
      if (updatedBillIds.length > 0 && this.aiQueueUrl) {
        await this.queueForAI(updatedBillIds);
      }

      const duration = Date.now() - startTime;
      await this.logSync('success', duration);
      console.log(`✅ Sync complete in ${duration}ms`);
      console.log(`   Bills checked: ${this.stats.billsChecked}`);
      console.log(`   Bills updated: ${this.stats.billsUpdated}`);
      console.log(`   Bills new:     ${this.stats.billsNew}`);
      console.log(`   Votes added:   ${this.stats.votesAdded}`);
      console.log(`   API queries:   ${this.legiscan.queryCount}`);

    } catch (err) {
      console.error('❌ Sync failed:', err);
      await this.logSync('error', Date.now() - startTime, err.message);
      throw err;
    }
  }

  // ── Session ──────────────────────────────

  async syncCurrentSession() {
    const sessions = await this.legiscan.getSessionList();

    // Reconcile EVERY session LegiScan knows about, honoring its prior flag.
    // This is what makes a new legislative session get detected automatically
    // and — critically — flips the previous session to prior=true in our DB so
    // cross-session features (the Most Improved badge, finalize-on-sine-die,
    // prior-session comparisons) actually work. The old code only ever wrote
    // the current session as prior=false and never marked anything prior.
    for (const s of sessions) {
      await this.db.upsert('sessions', {
        id:         s.session_id,
        year_start: s.year_start,
        year_end:   s.year_end,
        name:       s.session_name,
        special:    s.special === 1,
        sine_die:   s.sine_die === 1,
        prior:      s.prior === 1,
        updated_at: new Date().toISOString(),
      });
    }

    // Current session = most recent non-prior session
    const current = sessions
      .filter(s => !s.prior)
      .sort((a, b) => b.year_start - a.year_start)[0];

    return { id: current.session_id, name: current.session_name, sine_die: current.sine_die === 1 };
  }

  // ── Members ──────────────────────────────

  async syncMembers(sessionId) {
    const people = await this.legiscan.getSessionPeople(sessionId);
    console.log(`👥 Syncing ${people.length} members...`);

    for (const person of people) {
      await this.db.upsert('members', {
        id:                 person.people_id,
        legiscan_id:        person.people_id,
        first_name:         person.first_name,
        middle_name:        person.middle_name || null,
        last_name:          person.last_name,
        suffix:             person.suffix || null,
        nickname:           person.nickname || null,
        full_name:          person.name,
        party:              person.party,
        role:               person.role,
        district:           person.district,
        chamber:            person.role_id === 1 ? 'H' : 'S',
        // Only the lower chamber's timing is knowable with no per-member data
        // (every House seat shares one 2-year cycle) — see bootstrap.js's
        // matching comment for why the Senate is left null.
        next_election:      person.role_id === 1 ? nextLowerChamberElectionYear() : null,
        followthemoney_eid: person.ftm_eid || null,
        votesmart_id:       person.votesmart_id || null,
        opensecrets_id:     person.opensecrets_id || null,
        ballotpedia:        person.ballotpedia || null,
        is_current:         true, // in the current session's roster
        updated_at:         new Date().toISOString(),
      });

      // Track session membership
      await this.db.upsert('member_sessions', {
        member_id:  person.people_id,
        session_id: sessionId,
        party:      person.party,
        role:       person.role,
        district:   person.district,
      }, 'member_id,session_id');

      this.stats.membersUpdated++;
    }

    // Anyone NOT in the current roster is a former legislator. Flip them to
    // is_current=false so the directory can separate sitting members from the
    // ones who lost or retired — without ever deleting them. We shall never forget.
    const currentIds = people.map(p => p.people_id);
    if (currentIds.length) {
      await this.db.patch('members', `id=not.in.(${currentIds.join(',')})&is_current=eq.true`, {
        is_current: false,
      });
    }
  }

  // ── Bills (delta sync) ───────────────────

  async syncBills(session) {
    const masterList = await this.legiscan.getMasterListRaw(session.id);
    this.stats.billsChecked = masterList.length;
    console.log(`📄 Checking ${masterList.length} bills for changes...`);

    // Load ALL existing hashes from our DB (paginated — Supabase caps at 1000 per request)
    const existing = await this.db.selectAll(
      'bills',
      `select=id,change_hash&session_id=eq.${session.id}`
    );
    const hashMap = new Map(existing.map(b => [b.id, b.change_hash]));
    console.log(`   ${hashMap.size} existing bills in DB`);

    const updatedBillIds = [];

    for (const stub of masterList) {
      const billId = stub.bill_id;
      const isNew = !hashMap.has(billId);
      const changed = !isNew && hashMap.get(billId) !== stub.change_hash;

      if (isNew || changed) {
        try {
          await this.syncFullBill(billId, session.id);
          updatedBillIds.push(billId);
          if (isNew) this.stats.billsNew++;
          else this.stats.billsUpdated++;
        } catch (err) {
          console.error(`   ⚠ Skipping bill ${billId}: ${err.message}`);
        }

        // Progress logging
        if (updatedBillIds.length % 10 === 0) {
          console.log(`   ... ${updatedBillIds.length} bills synced (${this.legiscan.queryCount} API queries used)`);
        }
      }
    }

    console.log(`📝 ${updatedBillIds.length} bills updated/new`);
    return updatedBillIds;
  }

  async syncFullBill(billId, sessionId) {
    const bill = await this.legiscan.getBill(billId);

    // Extract best URL for full bill text
    const latestText = bill.texts?.length
      ? bill.texts[bill.texts.length - 1]
      : null;
    const billTextUrl = latestText?.state_link || latestText?.url || bill.url || null;

    // Capture the committee the bill sits in (LegiScan reports this on the bill).
    // Often where a bill dies — surfaced in the /committees view.
    const committee = bill.committee && bill.committee.committee_id ? bill.committee : null;
    if (committee) {
      await this.db.upsert('committees', {
        id:      committee.committee_id,
        name:    committee.name,
        chamber: committee.chamber || (committee.chamber_id === 2 ? 'S' : committee.chamber_id === 1 ? 'H' : null),
        updated_at: new Date().toISOString(),
      });
    }

    // Upsert core bill record
    await this.db.upsert('bills', {
      id:               bill.bill_id,
      legiscan_id:      bill.bill_id,
      session_id:       sessionId,
      bill_number:      bill.bill_number,
      bill_type:        bill.bill_type,
      title:            bill.title,
      description:      bill.description || null,
      chamber:          bill.body_id === 1 ? 'H' : 'S',
      status:           bill.status,
      status_text:      CONFIG.STATUS[bill.status] || 'Unknown',
      status_date:      bill.status_date || null,
      introduced_date:  bill.introduced_date || null,
      last_action:      bill.last_action || null,
      last_action_date: bill.last_action_date || null,
      change_hash:      bill.change_hash,
      bill_text_url:    billTextUrl,
      committee_id:     committee?.committee_id || null,
      committee_name:   committee?.name || null,
      is_archived:      bill.status === 4 || bill.status === 5,
      updated_at:       new Date().toISOString(),
    });

    // Upsert sponsors
    if (bill.sponsors?.length) {
      for (const sponsor of bill.sponsors) {
        // Ensure member exists (may not be in session people list if historical)
        await this.db.upsert('members', {
          id:          sponsor.people_id,
          legiscan_id: sponsor.people_id,
          first_name:  sponsor.first_name || '',
          last_name:   sponsor.last_name || '',
          full_name:   sponsor.name,
          party:       sponsor.party || null,
          role:        sponsor.role || null,
          updated_at:  new Date().toISOString(),
        });

        await this.db.upsert('bill_sponsors', {
          bill_id:           bill.bill_id,
          member_id:         sponsor.people_id,
          sponsor_type:      sponsor.sponsor_type_id,
          sponsor_type_text: sponsor.sponsor_type,
        }, 'bill_id,member_id');
      }
    }

    // Insert new bill actions (actions are append-only — only add ones we don't have yet)
    if (bill.history?.length) {
      const existing = await this.db.select(
        'bill_actions',
        `select=sequence&bill_id=eq.${bill.bill_id}`
      );
      const existingSeqs = new Set(existing.map(a => a.sequence));

      for (let i = 0; i < bill.history.length; i++) {
        if (existingSeqs.has(i)) continue; // already have this action
        const action = bill.history[i];
        await this.db.insertIgnore('bill_actions', {
          bill_id:     bill.bill_id,
          action_date: action.date,
          chamber:     action.chamber,
          action_text: action.action,
          sequence:    i,
        });
      }
    }

    return bill;
  }

  // ── Votes ─────────────────────────────────

  async syncVotesForBill(billId) {
    const bill = await this.legiscan.getBill(billId);
    if (!bill.votes?.length) return;

    for (const voteRef of bill.votes) {
      // Check if we already have this roll call
      const existing = await this.db.select(
        'roll_calls',
        `select=id&legiscan_id=eq.${voteRef.roll_call_id}`
      );
      if (existing.length > 0) continue; // already synced, roll calls are static

      const rollCall = await this.legiscan.getRollCall(voteRef.roll_call_id);

      // Upsert roll call
      await this.db.upsert('roll_calls', {
        id:          rollCall.roll_call_id,
        legiscan_id: rollCall.roll_call_id,
        bill_id:     billId,
        session_id:  rollCall.session_id,
        chamber:     rollCall.chamber === 'H' ? 'H' : 'S',
        date:        rollCall.date,
        description: rollCall.desc || null,
        yea:         rollCall.yea,
        nay:         rollCall.nay,
        nv:          rollCall.nv,
        absent:      rollCall.absent,
        total:       rollCall.total,
        passed:      rollCall.passed === 1,
      });

      // Upsert individual votes — WE SHALL NEVER FORGET
      if (rollCall.votes?.length) {
        for (const vote of rollCall.votes) {
          await this.db.upsert('votes', {
            roll_call_id: rollCall.roll_call_id,
            member_id:    vote.people_id,
            bill_id:      billId,
            vote_value:   vote.vote_id,
            vote_text:    CONFIG.VOTE[vote.vote_id] || 'Unknown',
          }, 'roll_call_id,member_id');
          this.stats.votesAdded++;
        }
      }
    }
  }

  // ── Archive Expired Bills ────────────────────

  /**
   * When a session adjourns sine die, any bill still at status 1/2/3
   * (Introduced/Engrossed/Enrolled) is effectively dead — it didn't pass.
   * Mark these as archived so the frontend can exclude them from "Active."
   * We do NOT change status/status_text — that's LegiScan's data.
   */
  async archiveExpiredBills(sessionId) {
    // Find all non-archived bills in this session still at status 1, 2, or 3
    const expiredBills = await this.db.selectAll(
      'bills',
      `select=id,bill_number&session_id=eq.${sessionId}&status=in.(1,2,3)&is_archived=eq.false`
    );

    if (expiredBills.length === 0) {
      console.log('📦 No expired bills to archive');
      return;
    }

    console.log(`📦 Session adjourned sine die — archiving ${expiredBills.length} expired bills...`);
    const now = new Date().toISOString();

    // PATCH, not upsert: INSERT...ON CONFLICT DO UPDATE must still validate the
    // candidate row against NOT NULL constraints (legiscan_id, bill_number, ...)
    // when constructing it, even for rows that will conflict and take the
    // UPDATE branch — so a partial-column upsert on an existing row always
    // fails. PATCH updates only the given columns, with no such check on the
    // rest. Batched (200 ids/request) so 2000+ expired bills don't need
    // one request each or blow past a URL length limit.
    const CHUNK = 200;
    const ids = expiredBills.map((b) => b.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);
      await this.db.patch('bills', `id=in.(${batch.join(',')})`, {
        is_archived: true,
        archived_at: now,
      });
    }

    console.log(`📦 Archived ${expiredBills.length} expired bills`);
  }

  // ── AI Queue ──────────────────────────────

  async queueForAI(billIds) {
    if (!this.aiQueueUrl) return;
    try {
      await fetch(this.aiQueueUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill_ids: billIds, task: 'summarize' }),
      });
      console.log(`🤖 Queued ${billIds.length} bills for AI summarization`);
    } catch (err) {
      console.error('AI queue error (non-fatal):', err);
    }
  }

  // ── Sync Log ──────────────────────────────

  async logSync(status, durationMs, errorMessage = null) {
    await this.db.upsert('sync_log', {
      status,
      bills_checked:   this.stats.billsChecked,
      bills_updated:   this.stats.billsUpdated,
      bills_new:       this.stats.billsNew,
      votes_added:     this.stats.votesAdded,
      members_updated: this.stats.membersUpdated,
      queries_used:    this.legiscan.queryCount,
      error_message:   errorMessage,
      duration_ms:     durationMs,
    }, 'id');
  }
}

// Named export for local testing
export { SyncEngine };

/**
 * Constant-time string comparison — avoids leaking how many leading characters
 * of the secret matched via response timing. (Length is not hidden, which is
 * acceptable for a fixed-length bearer secret.)
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// ─────────────────────────────────────────
// CLOUDFLARE WORKER ENTRY POINT
// ─────────────────────────────────────────

/**
 * wrangler.toml cron trigger:
 *   [triggers]
 *   crons = ["0 6 * * *"]   # runs daily at 6am UTC
 */
export default {
  // Cron trigger
  async scheduled(_event, env, _ctx) {
    const engine = new SyncEngine(env);
    await engine.run();
  },

  // Also expose as HTTP endpoint for manual triggers / testing
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Canary Blair Sync Worker. POST to trigger.', { status: 200 });
    }
    const authHeader = request.headers.get('Authorization') || '';
    if (!env.SYNC_SECRET || !safeEqual(authHeader, `Bearer ${env.SYNC_SECRET}`)) {
      return new Response('Unauthorized', { status: 401 });
    }
    try {
      const engine = new SyncEngine(env);
      await engine.run();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
