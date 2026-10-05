import { canReceiveTasks, isOpenToRole } from '@hbcfield/shared';

type Db = {
  spaceAssignment: {
    findFirst(args: unknown): Promise<{ user: { role: string; enabledModules: unknown; isExternal: boolean } } | null>;
  };
};

/**
 * Does this person hold the task's OPEN role in its workspace, right now —
 * and may they be given a job at all? (shared tasks/role-pool.ts)
 *
 * ONE rule, read by the task's own access check, its attachments and its
 * report, so the page, its photos and its report cannot disagree about who
 * may read an open job. Read-only: holding the role never lets anybody write.
 *
 * An external member, or an access profile without Tasks, is never a holder.
 */
export async function holdsOpenRole(
  db: Db,
  task: { openRoleId?: string | null; spaceId?: string | null; openSpotsLeft?: number | null; status?: string | null },
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isOpenToRole(task) || !task.spaceId) return false;
  const row = await db.spaceAssignment.findFirst({
    where: {
      userId,
      spaceId: task.spaceId,
      workRoleId: task.openRoleId!,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    select: { user: { select: { role: true, enabledModules: true, isExternal: true } } },
  });
  return !!row && !row.user.isExternal && canReceiveTasks(row.user as never);
}
