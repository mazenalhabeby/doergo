-- Two more ways an existing task type is refused, both created by history
-- rather than by anyone doing something wrong.
--
-- 1. DANGLING TARGETS. Deleting a step deleted the row and left every route to
--    it behind, pointing at a key that no longer exists. Harmless until the
--    validator read it as a route that is not one. The delete path is fixed so
--    this stops happening; this clears what it already left.
--
-- 2. A FINISHED STEP FOLLOWED BY ANOTHER. "Resolved" then "Closed" is a real
--    pair — the canonical flow has Completed → Closed — but neither declared a
--    route, so nothing could ever reach the second one and the validator called
--    it unreachable. Linked only when the NEXT step is also finished, so an
--    ordinary final step keeps its empty list.
--
-- Idempotent: after this runs, neither statement's WHERE matches again.

-- 1. Drop targets that name no existing step in the same workflow.
UPDATE "workflow_statuses" s
SET "transitions" = ARRAY(
  SELECT t FROM unnest(s."transitions") AS t
  WHERE EXISTS (
    SELECT 1 FROM "workflow_statuses" k
    WHERE k."workflowId" = s."workflowId" AND k.key = t
  )
)
WHERE EXISTS (
  SELECT 1 FROM unnest(s."transitions") AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM "workflow_statuses" k
    WHERE k."workflowId" = s."workflowId" AND k.key = t
  )
);

-- 2. Link a finished step to the finished step that follows it.
WITH pairs AS (
  SELECT
    id,
    "isFinal",
    LEAD(key)      OVER (PARTITION BY "workflowId" ORDER BY position, id) AS next_key,
    LEAD("isFinal") OVER (PARTITION BY "workflowId" ORDER BY position, id) AS next_is_final
  FROM "workflow_statuses"
  WHERE NOT "isCanceled"
)
UPDATE "workflow_statuses" s
SET "transitions" = ARRAY[p.next_key]
FROM pairs p
WHERE s.id = p.id
  AND p."isFinal"
  AND p.next_is_final
  AND p.next_key IS NOT NULL
  AND cardinality(s."transitions") = 0;
