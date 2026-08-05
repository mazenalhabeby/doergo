-- Heal time entries left CLOCKED_IN despite having a clock-out time. Before this
-- batch, editing a still-open entry to add a clock-out recomputed the duration but
-- never flipped `status`, so the row showed "Active" with a clock-out + duration
-- (the manual clock-out bug) AND never appeared in the Approvals tab (that queue
-- excludes CLOCKED_IN rows) even while marked PENDING. The edit path now closes +
-- auto-approves them going forward; this backfills the ones already broken.
--
-- The only way to have a clock-out while still CLOCKED_IN is an admin edit
-- (editEntry requires canManageUsers), so these are all admin manual clock-outs:
-- close them and auto-approve any still PENDING, crediting the admin who edited.
-- A system AUTO_OUT already has its own status, so it is untouched. Idempotent.
UPDATE "time_entries"
SET "status" = 'CLOCKED_OUT',
    "approvalStatus" = CASE WHEN "approvalStatus" = 'PENDING' THEN 'APPROVED' ELSE "approvalStatus" END,
    "approvedById"   = CASE WHEN "approvalStatus" = 'PENDING' THEN "editedById" ELSE "approvedById" END,
    "approvedAt"     = CASE WHEN "approvalStatus" = 'PENDING' THEN COALESCE("editedAt", "updatedAt", NOW()) ELSE "approvedAt" END,
    "approvalNotes"  = CASE WHEN "approvalStatus" = 'PENDING' THEN 'Auto-approved: manual clock-out by admin' ELSE "approvalNotes" END
WHERE "status" = 'CLOCKED_IN'
  AND "clockOutAt" IS NOT NULL;
