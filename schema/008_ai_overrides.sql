-- ============================================================
-- CANARY BLAIR — Migration 008: human overrides for AI classification
-- ============================================================
-- The AI's alignment/impact classification is good but not perfect, and one
-- badly-classified landmark bill can meaningfully swing a legislator's score.
-- These columns let a human correct a specific bill without re-running the AI
-- (and without the temptation to quietly re-prompt until you get the answer
-- you wanted). Overrides are audit-trailed and surfaced to readers with a
-- "manually reviewed" note — transparency cuts both ways.
--
-- The scorer and the frontend both use COALESCE(override, ai_value), so an
-- override silently takes precedence wherever the value is read.
-- ============================================================

ALTER TABLE bills ADD COLUMN IF NOT EXISTS ai_alignment_override    TEXT;      -- 'for_people' | 'for_capital' | 'neutral'
ALTER TABLE bills ADD COLUMN IF NOT EXISTS ai_impact_tier_override  INTEGER;   -- 1-6
ALTER TABLE bills ADD COLUMN IF NOT EXISTS override_reason          TEXT;      -- why the human changed it (shown to readers)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS override_at              TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS override_by              TEXT;      -- who reviewed it (initials/handle)

-- Keep the override values sane.
ALTER TABLE bills DROP CONSTRAINT IF EXISTS chk_alignment_override;
ALTER TABLE bills ADD CONSTRAINT chk_alignment_override
  CHECK (ai_alignment_override IS NULL OR ai_alignment_override IN ('for_people', 'for_capital', 'neutral'));

ALTER TABLE bills DROP CONSTRAINT IF EXISTS chk_impact_tier_override;
ALTER TABLE bills ADD CONSTRAINT chk_impact_tier_override
  CHECK (ai_impact_tier_override IS NULL OR ai_impact_tier_override BETWEEN 1 AND 6);

-- Convenience: effective (post-override) values. The frontend can select these
-- directly, and `is_reviewed` drives the "manually reviewed" note.
CREATE OR REPLACE VIEW bills_effective AS
SELECT
  b.*,
  COALESCE(b.ai_alignment_override, b.ai_alignment)     AS effective_alignment,
  COALESCE(b.ai_impact_tier_override, b.ai_impact_tier) AS effective_impact_tier,
  (b.ai_alignment_override IS NOT NULL OR b.ai_impact_tier_override IS NOT NULL) AS is_reviewed
FROM bills b;
