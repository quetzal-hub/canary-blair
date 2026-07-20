-- ============================================================
-- CANARY BLAIR — Migration 006: bulk Canary Score writes
-- ============================================================
-- One RPC call updates every member's score atomically, instead
-- of 134 sequential PATCH requests from the scoring worker.
-- Called by pipeline/lib/scoring.js (writeScores).
-- ============================================================

CREATE OR REPLACE FUNCTION update_canary_scores(scores jsonb)
RETURNS integer
LANGUAGE sql
AS $$
  WITH updated AS (
    UPDATE members m
    SET
      canary_score            = (s->>'canary_score')::integer,
      canary_tier             = (s->>'canary_tier')::integer,
      canary_badges           = ARRAY(SELECT jsonb_array_elements_text(s->'canary_badges')),
      canary_votes_scored     = (s->>'canary_votes_scored')::integer,
      canary_score_updated_at = NOW()
    FROM jsonb_array_elements(scores) AS s
    WHERE m.id = (s->>'id')::integer
    RETURNING m.id
  )
  SELECT COUNT(*)::integer FROM updated;
$$;

-- Only the service role (used by the pipeline workers) may call this.
REVOKE EXECUTE ON FUNCTION update_canary_scores(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_canary_scores(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION update_canary_scores(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION update_canary_scores(jsonb) TO service_role;
