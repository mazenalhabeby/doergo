-- Organization add-ons: capabilities bought once for the org, replacing tier gating.
--
-- SAFETY: the backfill below is the whole point of this migration. PlanGuard
-- stops asking "does this tier allow it?" and starts asking "did they buy it?".
-- Without a backfill every existing organization would answer no to everything
-- the moment the new gateway starts, and every premium mutation would 402 —
-- an outage for paying customers caused by a column defaulting to empty.
--
-- So each org is granted exactly the capabilities its CURRENT tier already
-- granted. Nobody gains anything, nobody loses anything, and the switch is
-- invisible until somebody deliberately changes what they have bought.
--
-- Idempotent: safe to re-run. The backfill only touches rows that are still
-- empty, so re-running cannot resurrect an add-on an admin has since removed.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "addOns" TEXT[] NOT NULL DEFAULT '{}';

-- STARTER granted no capabilities at all — nothing to backfill.

-- PROFESSIONAL: recurring, overtime, invoicing, priority_routing,
-- reports_builder, shift_scheduling.
UPDATE "organizations"
SET "addOns" = ARRAY[
      'recurring', 'overtime', 'invoicing',
      'priority_routing', 'reports_builder', 'shift_scheduling'
    ]
WHERE "planTier" = 'PROFESSIONAL'
  AND COALESCE(array_length("addOns", 1), 0) = 0;

-- BUSINESS: everything Professional had, plus workflows, audit_log, live_chat,
-- report_scheduling.
UPDATE "organizations"
SET "addOns" = ARRAY[
      'recurring', 'overtime', 'invoicing',
      'priority_routing', 'reports_builder', 'shift_scheduling',
      'workflows', 'audit_log', 'live_chat', 'report_scheduling'
    ]
WHERE "planTier" = 'BUSINESS'
  AND COALESCE(array_length("addOns", 1), 0) = 0;

-- ENTERPRISE was entitled to everything by a short-circuit in tierAllows(), so
-- it gets the whole catalogue spelled out. Enterprise contracts are negotiated,
-- and this keeps that promise explicit rather than implicit in a code branch.
UPDATE "organizations"
SET "addOns" = ARRAY[
      'recurring', 'overtime', 'invoicing',
      'priority_routing', 'reports_builder', 'shift_scheduling',
      'workflows', 'audit_log', 'live_chat', 'report_scheduling',
      'dedicated_support'
    ]
WHERE "planTier" = 'ENTERPRISE'
  AND COALESCE(array_length("addOns", 1), 0) = 0;

-- Read by the gate on every premium mutation.
CREATE INDEX IF NOT EXISTS "organizations_addOns_idx" ON "organizations" USING GIN ("addOns");
