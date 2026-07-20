-- ============================================================
-- CANARY BLAIR — Migration 009: sitting vs. former legislators
-- ============================================================
-- Members are never deleted (we shall never forget), but after an election the
-- directory would otherwise mix defeated/retired legislators in with sitting
-- ones. `is_current` marks who is in the latest session's roster. The sync
-- worker sets it true for the current roster and false for everyone else on
-- every run; the frontend defaults to sitting members with a toggle to view
-- the historical record.
-- ============================================================

-- Default TRUE so existing rows stay visible until the next sync reconciles them.
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_members_current ON members(is_current);
