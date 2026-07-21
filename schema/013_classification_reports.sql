-- ============================================================
-- CANARY BLAIR — Migration 013: classification error reports
-- ============================================================
-- A public, functional way for anyone — including a legislator or their staff —
-- to flag a bill they believe is misclassified. This is both good practice and
-- legal armor: a logged corrections queue is direct evidence the project tries
-- to be accurate and fixes errors, which undercuts any "reckless disregard for
-- the truth" claim. Reports feed the human-override workflow (schema 008).
--
-- Anyone may SUBMIT a report; nobody public may READ the queue (only the
-- service role / Supabase dashboard). No accounts, no tracking — contact is
-- optional and only used to follow up on a specific report.
-- ============================================================

CREATE TABLE IF NOT EXISTS classification_reports (
  id                SERIAL PRIMARY KEY,
  bill_id           INTEGER REFERENCES bills(id),
  reason            TEXT    NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
  reporter_contact  TEXT    CHECK (reporter_contact IS NULL OR char_length(reporter_contact) <= 200),
  status            TEXT    NOT NULL DEFAULT 'new',  -- 'new' | 'reviewed' | 'actioned' | 'dismissed'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON classification_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_bill   ON classification_reports(bill_id);

ALTER TABLE classification_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a report (INSERT only)...
DROP POLICY IF EXISTS "anyone can report a classification" ON classification_reports;
CREATE POLICY "anyone can report a classification"
  ON classification_reports FOR INSERT WITH CHECK (true);

-- ...but there is intentionally NO public SELECT/UPDATE/DELETE policy, so the
-- queue is readable only by the service role (dashboard / pipeline).
