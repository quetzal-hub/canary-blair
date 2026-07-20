-- ============================================================
-- CANARY BLAIR — Migration 011: campaign finance
-- ============================================================
-- Surfaces "who funds this legislator" next to their Canary Score, using
-- FollowTheMoney (now part of OpenSecrets). Populated by pipeline/finance.js,
-- which matches on the followthemoney_eid we already sync from LegiScan, and
-- falls back to name matching when the eid is missing.
--
-- The score stays pure math on the voting record; this is adjacent context,
-- clearly attributed to its source, not folded into the score.
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS finance_total_raised NUMERIC;      -- total contributions, dollars
ALTER TABLE members ADD COLUMN IF NOT EXISTS finance_cycle        INTEGER;       -- election cycle year, if scoped
ALTER TABLE members ADD COLUMN IF NOT EXISTS finance_source_url   TEXT;          -- link to the FollowTheMoney entity page
ALTER TABLE members ADD COLUMN IF NOT EXISTS finance_matched_by   TEXT;          -- 'eid' | 'name' — how we matched (transparency)
ALTER TABLE members ADD COLUMN IF NOT EXISTS finance_updated_at   TIMESTAMPTZ;
