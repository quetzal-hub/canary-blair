-- ============================================================
-- Migration 003: Bill Text Change Detection
-- Applied: 2026-03-15
--
-- Adds ai_summary_text_url to track which bill_text_url was
-- used when the AI summary was generated. This allows the
-- summarizer to detect when a bill's text has been amended
-- and only re-summarize those specific bills.
--
-- After adding the column, backfill existing summarized bills
-- so they all start with a matching baseline.
-- ============================================================

-- Add the tracking column
ALTER TABLE bills ADD COLUMN IF NOT EXISTS ai_summary_text_url TEXT;

-- Backfill: set ai_summary_text_url = bill_text_url for all
-- already-summarized bills (establishes the baseline)
UPDATE bills
SET ai_summary_text_url = bill_text_url
WHERE ai_summary IS NOT NULL
  AND ai_summary_text_url IS NULL;
