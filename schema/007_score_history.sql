-- ============================================================
-- CANARY BLAIR — Migration 007: permanent score history
-- ============================================================
-- "We shall never forget." Scores are overwritten in place on the
-- members table every week; this table keeps an append-only record
-- of every recalculation, per session, so:
--   * a legislator can't vote their way out of a past session's tier
--   * the "Most Improved" badge can compare across sessions
--   * profiles can chart a score over time
--
-- A row is written every time scores are recalculated. When a session
-- goes sine die (finalized), its latest snapshot is marked is_final —
-- a permanent public record that never changes again.
-- ============================================================

CREATE TABLE IF NOT EXISTS member_score_history (
  id              SERIAL PRIMARY KEY,
  member_id       INTEGER NOT NULL REFERENCES members(id),
  session_id      INTEGER REFERENCES sessions(id),
  canary_score    INTEGER,                      -- null = unscored at snapshot time
  canary_tier     INTEGER,
  canary_badges   TEXT[]  NOT NULL DEFAULT '{}',
  votes_scored    INTEGER NOT NULL DEFAULT 0,
  is_final        BOOLEAN NOT NULL DEFAULT FALSE, -- true once the session is sine die
  snapshot_date   DATE    NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_score_history_member  ON member_score_history(member_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_score_history_session ON member_score_history(session_id);

-- At most one snapshot per member per session per day — a re-run on the same
-- day updates the existing row instead of piling up duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_score_history_daily
  ON member_score_history(member_id, session_id, snapshot_date);

-- Public can read history (it's the permanent record); only the service role writes.
ALTER TABLE member_score_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "score history is public" ON member_score_history;
CREATE POLICY "score history is public" ON member_score_history FOR SELECT USING (true);

-- ─────────────────────────────────────────
-- RPC: append a batch of history snapshots in one call.
-- Upserts on (member_id, session_id, snapshot_date) so same-day re-runs
-- refresh rather than duplicate. Called by pipeline/lib/scoring.js.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION append_score_history(snapshots jsonb, p_session_id integer)
RETURNS integer
LANGUAGE sql
AS $$
  WITH inserted AS (
    INSERT INTO member_score_history
      (member_id, session_id, canary_score, canary_tier, canary_badges, votes_scored, snapshot_date)
    SELECT
      (s->>'id')::integer,
      p_session_id,
      NULLIF(s->>'canary_score', '')::integer,
      NULLIF(s->>'canary_tier', '')::integer,
      ARRAY(SELECT jsonb_array_elements_text(s->'canary_badges')),
      (s->>'canary_votes_scored')::integer,
      CURRENT_DATE
    FROM jsonb_array_elements(snapshots) AS s
    ON CONFLICT (member_id, session_id, snapshot_date) DO UPDATE
      SET canary_score  = EXCLUDED.canary_score,
          canary_tier   = EXCLUDED.canary_tier,
          canary_badges = EXCLUDED.canary_badges,
          votes_scored  = EXCLUDED.votes_scored,
          created_at    = NOW()
    RETURNING 1
  )
  SELECT COUNT(*)::integer FROM inserted;
$$;

REVOKE EXECUTE ON FUNCTION append_score_history(jsonb, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION append_score_history(jsonb, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION append_score_history(jsonb, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION append_score_history(jsonb, integer) TO service_role;

-- ─────────────────────────────────────────
-- RPC: finalize a session's history (call when a session goes sine die).
-- Marks the most recent snapshot per member for that session as permanent.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION finalize_session_scores(p_session_id integer)
RETURNS integer
LANGUAGE sql
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (member_id) id
    FROM member_score_history
    WHERE session_id = p_session_id
    ORDER BY member_id, snapshot_date DESC
  ), finalized AS (
    UPDATE member_score_history h
    SET is_final = TRUE
    FROM latest
    WHERE h.id = latest.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer FROM finalized;
$$;

REVOKE EXECUTE ON FUNCTION finalize_session_scores(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION finalize_session_scores(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION finalize_session_scores(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION finalize_session_scores(integer) TO service_role;
