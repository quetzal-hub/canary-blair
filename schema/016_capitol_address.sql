-- ============================================================
-- CANARY BLAIR — Migration 016: capitol mailing address
-- ============================================================
-- members.email and members.phone already existed (schema/001) but were
-- never populated — LegiScan's getSessionPeople/getPerson includes them
-- (bio.social.email, bio.social.capitol_phone) plus a full capitol mailing
-- address we didn't have a column for at all. Populated by bootstrap.js and
-- sync.js from data we already have full access to — no new API key needed.
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS capitol_address TEXT;
