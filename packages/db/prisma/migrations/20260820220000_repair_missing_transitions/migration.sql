-- Repair task types whose steps declare no transitions.
--
-- Statuses were written with empty `transitions` for a long time, and it was
-- harmless: nothing read them. Then the validator arrived, and a step with no
-- way out and no "finished" mark became a dead end — so every one of those task
-- types started being REFUSED the moment somebody tried to offer it in a space.
-- Existing, previously working flows became unusable, and the message was a wall
-- of one sentence per step.
--
-- This writes the chain the editor implies and now writes itself: each working
-- step to the next non-cancelled one, plus the cancel step, which is reachable
-- from anywhere rather than sitting in the middle of the flow.
--
-- Conservative on purpose:
--   * only rows with NO transitions at all — anything already declaring a route,
--     including branching from a library template, is left exactly as it is;
--   * never touches a final or cancelled step, which are meant to have none;
--   * a working step with nothing after it is left alone rather than pointed
--     somewhere invented. The validator still reports it, which is correct: only
--     a person can say what should follow the last step.
--
-- Idempotent: after it runs, the rows it fixed no longer match its WHERE.

WITH flow AS (
  SELECT
    id,
    "workflowId",
    LEAD(key) OVER (PARTITION BY "workflowId" ORDER BY position, id) AS next_key
  FROM "workflow_statuses"
  WHERE NOT "isCanceled"
),
cancel_step AS (
  SELECT DISTINCT ON ("workflowId") "workflowId", key AS cancel_key
  FROM "workflow_statuses"
  WHERE "isCanceled"
  ORDER BY "workflowId", position, id
)
UPDATE "workflow_statuses" s
SET "transitions" = ARRAY(
  SELECT x FROM unnest(ARRAY[f.next_key, c.cancel_key]) AS x WHERE x IS NOT NULL
)
FROM flow f
LEFT JOIN cancel_step c ON c."workflowId" = f."workflowId"
WHERE s.id = f.id
  AND cardinality(s."transitions") = 0
  AND NOT s."isFinal"
  AND NOT s."isCanceled"
  AND f.next_key IS NOT NULL;
