-- ============================================================
-- CANARY BLAIR — Migration 019: committee memberships
-- ============================================================
-- Who sits on (and, crucially, who CHAIRS) each standing committee. LegiScan
-- doesn't provide committee rosters, so pipeline/committee-scrape.js scrapes
-- the WV Legislature's own committee pages (which list Chair / Vice-Chair /
-- Minority Chair / members, each linked to the member).
--
-- This is what makes the Graveyard attributable: a bill dies in a committee,
-- and the committee's CHAIR controls that committee's agenda — so the chair is
-- accountable for what was never given a vote there. A rank-and-file member
-- who isn't on the committee is not.
-- ============================================================

CREATE TABLE committee_memberships (
  id              SERIAL PRIMARY KEY,
  committee_key   TEXT NOT NULL,             -- 'H:jud' | 'S:fin' (chamber + roster chart code)
  committee_name  TEXT NOT NULL,             -- as shown on the roster page, e.g. 'Judiciary'
  chamber         TEXT NOT NULL,             -- 'H' | 'S'
  member_id       INTEGER REFERENCES members(id),  -- null when the scraped name couldn't be matched
  member_display  TEXT NOT NULL,             -- raw scraped name, e.g. 'Delegate Akers'
  role            TEXT NOT NULL,             -- 'chair' | 'vice_chair' | 'minority_chair' | 'minority_vice_chair' | 'member'
  source_url      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (committee_key, member_display)
);

CREATE INDEX idx_committee_memberships_member ON committee_memberships(member_id);
CREATE INDEX idx_committee_memberships_name   ON committee_memberships(committee_name, chamber);
CREATE INDEX idx_committee_memberships_role   ON committee_memberships(role);

ALTER TABLE committee_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read committee_memberships" ON committee_memberships FOR SELECT USING (true);
