-- ============================================================
-- CANARY BLAIR — Migration 017: Open States supplemental bio data
-- ============================================================
-- Populated by pipeline/openstates-sync.js. LegiScan has neither field, and
-- neither does the WV Legislature's own site. Open States has ~69% coverage
-- for birth_date among WV legislators (checked directly, 94/136) and ~98%
-- for gender — no coverage at all for profession (checked directly, 0/136,
-- so that field isn't captured; it simply isn't filled in for this state).
-- gender is captured for potential aggregate stats (e.g. "% women in the
-- legislature") — no per-member UI for it yet.
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS gender TEXT;
