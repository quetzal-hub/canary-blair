-- ============================================================
-- CANARY BLAIR — Migration 014: campaign finance detail
-- ============================================================
-- Deepens the "who funds this legislator" picture beyond the raw total
-- (schema/011): top donors, industry breakdown, individual vs organization
-- split, and the small-donor share. Populated by pipeline/finance.js using
-- FollowTheMoney's documented grouping tokens (gro=d-eid / d-cci / d-et and
-- the d-amt=0,200 filter for small-dollar contributions).
--
-- Same design rule as 011: this is attributed context displayed next to the
-- record — the Canary Score itself stays pure math on votes and sponsorship.
-- ============================================================

-- Top contributor entities: [{ name, type, total, records }, ...] sorted by
-- total desc ("type" is FollowTheMoney's Individual / Non-Individual / Other).
ALTER TABLE members ADD COLUMN IF NOT EXISTS finance_top_donors JSONB;

-- Industry breakdown: [{ industry, sector, total, records }, ...] sorted by
-- total desc (FollowTheMoney's industry + parent sector classification).
ALTER TABLE members ADD COLUMN IF NOT EXISTS finance_top_industries JSONB;

-- Contributor-type split: [{ type, total, records }, ...] — Individual vs
-- Non-Individual (organizations, PACs, businesses) vs Other (e.g. unitemized).
ALTER TABLE members ADD COLUMN IF NOT EXISTS finance_contrib_types JSONB;

-- Total from contributions of $200 or less (small-donor proxy, d-amt=0,200).
ALTER TABLE members ADD COLUMN IF NOT EXISTS finance_small_donor_total NUMERIC;
