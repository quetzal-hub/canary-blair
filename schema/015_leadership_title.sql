-- ============================================================
-- CANARY BLAIR — Migration 015: leadership title
-- ============================================================
-- Populated by pipeline/photos.js from the WV Legislature's own public
-- roster pages, which list each chamber's leadership (Speaker, Majority
-- Leader, Committee assignments are separate — this is just chamber-wide
-- leadership roles like Speaker/President/Whip). NULL for members with no
-- listed leadership role.
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS leadership_title TEXT;
