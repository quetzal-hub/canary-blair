-- ============================================================
-- CANARY BLAIR — Database Schema
-- Supabase / PostgreSQL
-- ============================================================
-- Philosophy: Nothing is ever deleted. Every vote, every bill,
-- every moment of accountability lives here permanently.
-- We shall never forget.
-- ============================================================

-- ─────────────────────────────────────────
-- SESSIONS
-- ─────────────────────────────────────────
CREATE TABLE sessions (
  id              INTEGER PRIMARY KEY,        -- LegiScan session_id
  state           TEXT    NOT NULL DEFAULT 'WV',
  year_start      INTEGER NOT NULL,
  year_end        INTEGER NOT NULL,
  name            TEXT    NOT NULL,           -- e.g. "2026 Regular Session"
  special         BOOLEAN NOT NULL DEFAULT FALSE,
  sine_die        BOOLEAN NOT NULL DEFAULT FALSE,
  prior           BOOLEAN NOT NULL DEFAULT FALSE,
  legiscan_hash   TEXT,                       -- for change detection
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- MEMBERS (legislators)
-- ─────────────────────────────────────────
CREATE TABLE members (
  id              INTEGER PRIMARY KEY,        -- LegiScan people_id
  legiscan_id     INTEGER UNIQUE NOT NULL,
  first_name      TEXT    NOT NULL,
  middle_name     TEXT,
  last_name       TEXT    NOT NULL,
  suffix          TEXT,
  nickname        TEXT,
  full_name       TEXT    NOT NULL,
  party           TEXT,                       -- D, R, I, etc.
  role            TEXT,                       -- Rep, Sen
  district        TEXT,
  chamber         TEXT,                       -- H or S
  email           TEXT,
  phone           TEXT,
  photo_url       TEXT,
  followthemoney_eid TEXT,
  votesmart_id    INTEGER,
  opensecrets_id  TEXT,
  ballotpedia     TEXT,
  -- AI-generated fields (refreshed periodically)
  ai_profile_summary    TEXT,               -- voting pattern summary
  ai_profile_updated_at TIMESTAMPTZ,
  -- Canary Score fields (calculated by pipeline/score.js)
  canary_score          INTEGER,            -- 0–100 accountability score
  canary_tier           INTEGER,            -- 1–6 tier number (name/emoji derived in frontend)
  canary_badges         TEXT[],             -- ['lone-canary','ghost','lockstep',...]
  canary_votes_scored   INTEGER DEFAULT 0,  -- number of votes used in score calculation
  canary_score_updated_at TIMESTAMPTZ,
  next_election         INTEGER,            -- year of next election (e.g. 2026, 2028)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- BILLS
-- ─────────────────────────────────────────
CREATE TABLE bills (
  id              INTEGER PRIMARY KEY,        -- LegiScan bill_id
  legiscan_id     INTEGER UNIQUE NOT NULL,
  session_id      INTEGER NOT NULL REFERENCES sessions(id),
  bill_number     TEXT    NOT NULL,           -- e.g. HB5629
  bill_type       TEXT    NOT NULL,           -- B (bill), R (resolution), etc.
  title           TEXT    NOT NULL,
  description     TEXT,
  state           TEXT    NOT NULL DEFAULT 'WV',
  chamber         TEXT,                       -- H or S
  status          INTEGER,                    -- LegiScan status code
  status_text     TEXT,                       -- Introduced, Passed, etc.
  status_date     DATE,
  -- Full text
  bill_text       TEXT,                       -- decoded bill text
  bill_text_url   TEXT,
  -- Timestamps from LegiScan
  introduced_date DATE,
  last_action     TEXT,
  last_action_date DATE,
  -- Change tracking (delta sync)
  change_hash     TEXT    NOT NULL,
  -- AI-generated fields (set by pipeline/summarize.js)
  ai_summary              TEXT,              -- plain language summary
  ai_critical_points      TEXT[],            -- key provisions bullet points
  ai_who_benefits         TEXT,              -- who does this help?
  ai_who_is_hurt          TEXT,              -- who does this harm?
  ai_alignment            TEXT,              -- 'for_people', 'for_capital', or 'neutral'
  ai_impact_tier          INTEGER,           -- 1-6 bill impact tier (1=Landmark, 2=High Impact, 3=Meaningful, 4=Routine, 5=Minor, 6=Ceremonial)
  ai_tags                 TEXT[],            -- ['water','education','corporate']
  ai_summary_updated_at   TIMESTAMPTZ,
  ai_summary_text_url     TEXT,              -- bill_text_url used when summary was generated (for change detection)
  -- Archive flag
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bills_session    ON bills(session_id);
CREATE INDEX idx_bills_status     ON bills(status);
CREATE INDEX idx_bills_status_date ON bills(status_date DESC);
CREATE INDEX idx_bills_tags       ON bills USING GIN(ai_tags);

-- ─────────────────────────────────────────
-- BILL SPONSORS
-- ─────────────────────────────────────────
CREATE TABLE bill_sponsors (
  id          SERIAL PRIMARY KEY,
  bill_id     INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  sponsor_type INTEGER,                       -- 1=primary, 2=co-sponsor
  sponsor_type_text TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bill_id, member_id)
);

CREATE INDEX idx_bill_sponsors_bill   ON bill_sponsors(bill_id);
CREATE INDEX idx_bill_sponsors_member ON bill_sponsors(member_id);

-- ─────────────────────────────────────────
-- ROLL CALLS (vote events)
-- ─────────────────────────────────────────
CREATE TABLE roll_calls (
  id              INTEGER PRIMARY KEY,        -- LegiScan roll_call_id
  legiscan_id     INTEGER UNIQUE NOT NULL,
  bill_id         INTEGER NOT NULL REFERENCES bills(id),
  session_id      INTEGER NOT NULL REFERENCES sessions(id),
  chamber         TEXT    NOT NULL,           -- H or S
  date            DATE    NOT NULL,
  description     TEXT,
  yea             INTEGER NOT NULL DEFAULT 0,
  nay             INTEGER NOT NULL DEFAULT 0,
  nv              INTEGER NOT NULL DEFAULT 0, -- not voting
  absent          INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL DEFAULT 0,
  passed          BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roll_calls_bill    ON roll_calls(bill_id);
CREATE INDEX idx_roll_calls_date    ON roll_calls(date DESC);
CREATE INDEX idx_roll_calls_session ON roll_calls(session_id);

-- ─────────────────────────────────────────
-- VOTES (individual member votes)
-- ─────────────────────────────────────────
CREATE TABLE votes (
  id          SERIAL PRIMARY KEY,
  roll_call_id INTEGER NOT NULL REFERENCES roll_calls(id),
  member_id   INTEGER NOT NULL REFERENCES members(id),
  bill_id     INTEGER NOT NULL REFERENCES bills(id),
  vote_value  INTEGER NOT NULL,               -- 1=Yea, 2=Nay, 3=NV, 4=Absent
  vote_text   TEXT    NOT NULL,               -- "Yea", "Nay", "NV", "Absent"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(roll_call_id, member_id)
);

CREATE INDEX idx_votes_roll_call ON votes(roll_call_id);
CREATE INDEX idx_votes_member    ON votes(member_id);
CREATE INDEX idx_votes_bill      ON votes(bill_id);

-- ─────────────────────────────────────────
-- SESSION DIGESTS (AI-generated summaries)
-- ─────────────────────────────────────────
CREATE TABLE session_digests (
  id            SERIAL PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES sessions(id),
  period_type   TEXT    NOT NULL CHECK (period_type IN ('daily','weekly','monthly','yearly')),
  period_start  DATE    NOT NULL,
  period_end    DATE    NOT NULL,
  summary       TEXT    NOT NULL,             -- AI-generated digest
  bills_covered INTEGER[],                    -- bill_ids included in digest
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, period_type, period_start)
);

CREATE INDEX idx_digests_session ON session_digests(session_id);
CREATE INDEX idx_digests_period  ON session_digests(period_type, period_start DESC);

-- ─────────────────────────────────────────
-- SYNC LOG (audit trail of all pipeline runs)
-- ─────────────────────────────────────────
CREATE TABLE sync_log (
  id            SERIAL PRIMARY KEY,
  run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT    NOT NULL,             -- 'success', 'partial', 'error'
  bills_checked INTEGER NOT NULL DEFAULT 0,
  bills_updated INTEGER NOT NULL DEFAULT 0,
  bills_new     INTEGER NOT NULL DEFAULT 0,
  votes_added   INTEGER NOT NULL DEFAULT 0,
  members_updated INTEGER NOT NULL DEFAULT 0,
  queries_used  INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  duration_ms   INTEGER
);

-- ─────────────────────────────────────────
-- MEMBER SESSION MEMBERSHIP
-- tracks which session each member served in
-- ─────────────────────────────────────────
CREATE TABLE member_sessions (
  id          SERIAL PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  session_id  INTEGER NOT NULL REFERENCES sessions(id),
  party       TEXT,
  role        TEXT,
  district    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, session_id)
);

-- ─────────────────────────────────────────
-- BILL ACTIONS (full history log per bill)
-- ─────────────────────────────────────────
CREATE TABLE bill_actions (
  id          SERIAL PRIMARY KEY,
  bill_id     INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  action_date DATE    NOT NULL,
  chamber     TEXT,
  action_text TEXT    NOT NULL,
  sequence    INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bill_actions_bill ON bill_actions(bill_id);
CREATE INDEX idx_bill_actions_date ON bill_actions(action_date DESC);

-- ─────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────

-- Member vote summary (for quick stats on a member profile)
CREATE VIEW member_vote_summary AS
SELECT
  m.id AS member_id,
  m.full_name,
  m.party,
  m.chamber,
  m.district,
  COUNT(v.id)                                             AS total_votes,
  COUNT(v.id) FILTER (WHERE v.vote_value = 1)            AS yea_count,
  COUNT(v.id) FILTER (WHERE v.vote_value = 2)            AS nay_count,
  COUNT(v.id) FILTER (WHERE v.vote_value = 3)            AS not_voting_count,
  COUNT(v.id) FILTER (WHERE v.vote_value = 4)            AS absent_count,
  ROUND(
    COUNT(v.id) FILTER (WHERE v.vote_value = 1)::NUMERIC
    / NULLIF(COUNT(v.id), 0) * 100, 1
  ) AS yea_pct
FROM members m
LEFT JOIN votes v ON v.member_id = m.id
GROUP BY m.id, m.full_name, m.party, m.chamber, m.district;

-- Active bills (current session, not yet passed or failed)
CREATE VIEW active_bills AS
SELECT b.*, s.name AS session_name
FROM bills b
JOIN sessions s ON s.id = b.session_id
WHERE b.status IN (1, 2, 3)  -- Introduced, Engrossed, Enrolled
  AND b.is_archived = false   -- Exclude bills from ended sessions
ORDER BY b.last_action_date DESC;

-- Passed bills (permanent record)
CREATE VIEW passed_bills AS
SELECT b.*, s.name AS session_name
FROM bills b
JOIN sessions s ON s.id = b.session_id
WHERE b.status = 4
ORDER BY b.status_date DESC;

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY (public read, no public write)
-- ─────────────────────────────────────────
ALTER TABLE sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_sponsors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE roll_calls     ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_actions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_sessions ENABLE ROW LEVEL SECURITY;

-- Public can read everything
CREATE POLICY "public read sessions"        ON sessions        FOR SELECT USING (true);
CREATE POLICY "public read members"         ON members         FOR SELECT USING (true);
CREATE POLICY "public read bills"           ON bills           FOR SELECT USING (true);
CREATE POLICY "public read bill_sponsors"   ON bill_sponsors   FOR SELECT USING (true);
CREATE POLICY "public read roll_calls"      ON roll_calls      FOR SELECT USING (true);
CREATE POLICY "public read votes"           ON votes           FOR SELECT USING (true);
CREATE POLICY "public read digests"         ON session_digests FOR SELECT USING (true);
CREATE POLICY "public read bill_actions"    ON bill_actions    FOR SELECT USING (true);
CREATE POLICY "public read member_sessions" ON member_sessions FOR SELECT USING (true);

-- sync_log is private (service role only — no public policy needed)
