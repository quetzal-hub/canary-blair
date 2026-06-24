-- ============================================================
-- Migration 004: Update active_bills View for Archive Support
-- Applied: 2026-03-15
--
-- The active_bills view now excludes archived bills. When a
-- session adjourns sine die, the sync pipeline marks all
-- remaining status 1/2/3 bills as is_archived=true. This view
-- change ensures they no longer appear as "active."
--
-- Must DROP first because CREATE OR REPLACE fails when the
-- underlying table columns have changed (b.* expansion).
-- ============================================================

DROP VIEW IF EXISTS active_bills;

CREATE VIEW active_bills AS
SELECT b.*, s.name AS session_name
FROM bills b
JOIN sessions s ON s.id = b.session_id
WHERE b.status IN (1, 2, 3)  -- Introduced, Engrossed, Enrolled
  AND b.is_archived = false   -- Exclude bills from ended sessions
ORDER BY b.last_action_date DESC;
