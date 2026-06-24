-- ============================================================
-- Migration 005: Refresh passed_bills View
-- Applied: 2026-03-15
--
-- The passed_bills view uses b.* which breaks after adding
-- new columns to the bills table. Drop and recreate to pick
-- up all current columns.
-- ============================================================

DROP VIEW IF EXISTS passed_bills;

CREATE VIEW passed_bills AS
SELECT b.*, s.name AS session_name
FROM bills b
JOIN sessions s ON s.id = b.session_id
WHERE b.status = 4
ORDER BY b.status_date DESC;
