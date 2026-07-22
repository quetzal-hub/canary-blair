-- ============================================================
-- CANARY BLAIR — Migration 018: statewide officials
-- ============================================================
-- Non-legislator elected officials: the executive branch (Governor + the
-- other Board of Public Works offices) and the elected Supreme Court of
-- Appeals justices. Seeded by pipeline/officials-seed.js from officeholders
-- verified against each office's own official state website; the governor's
-- Canary Score is computed by pipeline/governor-score.js from bill_actions
-- ("Approved by Governor" / "Vetoed by Governor" / "Became law without
-- Governor's signature") joined against the same AI bill classifications the
-- legislator scores use.
--
-- Justices are DISPLAYED (with campaign finance once populated), never
-- scored — scoring judicial decisions is out of scope by design.
-- ============================================================

CREATE TABLE officials (
  id                        SERIAL PRIMARY KEY,
  slug                      TEXT UNIQUE NOT NULL,  -- 'governor', 'attorney-general', 'justice-bunn', ...
  office                    TEXT NOT NULL,          -- display title: 'Governor', 'Attorney General', ...
  office_group              TEXT NOT NULL,          -- 'executive' | 'judicial'
  full_name                 TEXT NOT NULL,
  party                     TEXT,                   -- null when not confirmed by a source (or nonpartisan: WV justices)
  photo_url                 TEXT,
  email                     TEXT,
  phone                     TEXT,
  website                   TEXT,
  term_start                INTEGER,                -- year current term began
  next_election             INTEGER,

  -- FollowTheMoney linkage + finance snapshot (same shape as members)
  followthemoney_eid        BIGINT,
  finance_total_raised      NUMERIC,
  finance_top_donors        JSONB,
  finance_top_industries    JSONB,
  finance_contrib_types     JSONB,
  finance_small_donor_total NUMERIC,
  finance_source_url        TEXT,
  finance_matched_by        TEXT,
  finance_updated_at        TIMESTAMPTZ,

  -- Canary Score (governor only; null for everyone else)
  canary_score              INTEGER,
  canary_tier               INTEGER,
  score_breakdown           JSONB,                  -- full audit trail: every scored action with its points
  score_updated_at          TIMESTAMPTZ,

  is_current                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE officials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read officials" ON officials FOR SELECT USING (true);
