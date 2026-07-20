-- ============================================================
-- CANARY BLAIR — Migration 010: committees
-- ============================================================
-- Committees are where most bills quietly die, out of sight of floor votes.
-- LegiScan's getBill reports the committee a bill currently sits in (or was
-- last referred to), so we capture that association during sync and surface it
-- as a browsable "where bills die" view.
--
-- Scope note: LegiScan's standard API gives us bill→committee, not full
-- committee membership rosters, so this tracks which bills are in which
-- committee and how they fared — not who sits on each committee.
-- ============================================================

CREATE TABLE IF NOT EXISTS committees (
  id          INTEGER PRIMARY KEY,        -- LegiScan committee_id
  name        TEXT    NOT NULL,
  chamber     TEXT,                       -- H or S
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS committee_id   INTEGER REFERENCES committees(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS committee_name TEXT;

CREATE INDEX IF NOT EXISTS idx_bills_committee ON bills(committee_id);

-- Public read, service-role write (consistent with the rest of the schema).
ALTER TABLE committees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "committees are public" ON committees;
CREATE POLICY "committees are public" ON committees FOR SELECT USING (true);
