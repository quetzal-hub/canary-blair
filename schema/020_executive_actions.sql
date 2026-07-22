-- ============================================================
-- CANARY BLAIR — Migration 020: executive actions
-- ============================================================
-- Two ways to grade the Governor beyond bills that reached his desk:
--
-- 1. EXECUTIVE ORDERS (executive_orders): unilateral policy the Governor
--    issues on his own initiative — the purest expression of his will, with
--    no legislature to share credit or blame. Scraped from governor.wv.gov /
--    the SoS executive journal by pipeline/eo-classify.js, classified with
--    the same for_people/for_capital + impact-tier AI framework as bills, and
--    folded into his Canary Score weighted like a primary sponsorship (his
--    own action, not a reaction).
--
-- 2. EXECUTIVE-REQUEST BILLS (bills.executive_request): bills the Governor
--    asked the legislature to pass — his championed agenda, marked "[By
--    Request of the Executive]" in the bill text. Detected by
--    pipeline/executive-request-scan.js. A bill he BOTH requested AND signed
--    is the strongest ownership signal, and scores with extra weight.
-- ============================================================

ALTER TABLE bills ADD COLUMN IF NOT EXISTS executive_request BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE executive_orders (
  id                      SERIAL PRIMARY KEY,
  eo_number               TEXT UNIQUE NOT NULL,   -- '3-25'
  eo_date                 DATE,
  title                   TEXT NOT NULL,
  pdf_url                 TEXT,

  -- Same AI classification shape as bills (see schema/012 bill_reasoning).
  ai_summary              TEXT,
  ai_who_benefits         TEXT,
  ai_who_is_hurt          TEXT,
  ai_reasoning            TEXT,
  ai_alignment            TEXT,                   -- 'for_people' | 'for_capital' | 'neutral'
  ai_impact_tier          INTEGER,                -- 1-6
  ai_confidence           TEXT,                   -- 'high' | 'medium' | 'low'
  ai_tags                 TEXT[],

  -- Human override (mirrors schema/008 for bills).
  ai_alignment_override   TEXT,
  ai_impact_tier_override INTEGER,
  override_reason         TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE executive_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read executive_orders" ON executive_orders FOR SELECT USING (true);
