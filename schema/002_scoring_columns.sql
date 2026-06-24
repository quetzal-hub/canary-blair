-- ============================================================
-- Migration 002: Canary Score + AI Enhancement Columns
-- Applied: 2026-03-14
--
-- Adds scoring fields to members table and enhanced AI fields
-- to bills table. These support the Canary Score accountability
-- system and richer bill analysis (alignment, impact tier, etc.)
-- ============================================================

-- ─────────────────────────────────────────
-- MEMBERS: Canary Score fields
-- ─────────────────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_score          INTEGER;
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_tier           INTEGER;
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_badges         TEXT[];
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_votes_scored   INTEGER DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_score_updated_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS next_election         INTEGER;

-- ─────────────────────────────────────────
-- BILLS: Enhanced AI analysis fields
-- ─────────────────────────────────────────
ALTER TABLE bills ADD COLUMN IF NOT EXISTS ai_critical_points TEXT[];
ALTER TABLE bills ADD COLUMN IF NOT EXISTS ai_alignment       TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS ai_impact_tier     INTEGER;
