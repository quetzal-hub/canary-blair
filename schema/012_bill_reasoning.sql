-- ============================================================
-- CANARY BLAIR — Migration 012: classification reasoning + confidence
-- ============================================================
-- The AI now reasons before it labels a bill and reports how confident it is.
-- Storing both makes the classification auditable (the "why" behind the label)
-- and lets low-confidence calls be flagged for human review instead of trusted
-- blindly — honesty about uncertainty is part of the credibility promise.
-- ============================================================

ALTER TABLE bills ADD COLUMN IF NOT EXISTS ai_reasoning  TEXT;   -- the mechanism behind the alignment call
ALTER TABLE bills ADD COLUMN IF NOT EXISTS ai_confidence TEXT;   -- 'high' | 'medium' | 'low'

ALTER TABLE bills DROP CONSTRAINT IF EXISTS chk_ai_confidence;
ALTER TABLE bills ADD CONSTRAINT chk_ai_confidence
  CHECK (ai_confidence IS NULL OR ai_confidence IN ('high', 'medium', 'low'));

-- Handy for a review queue: low-confidence, not-yet-overridden bills.
CREATE INDEX IF NOT EXISTS idx_bills_low_confidence
  ON bills(ai_confidence) WHERE ai_confidence = 'low';
