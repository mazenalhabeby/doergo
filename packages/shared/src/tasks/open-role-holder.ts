import { canReceiveTasks } from '../types/modules';
import { isOpenToRole } from './role-pool';

import { activeWindowWhere } from '../access/assignment-window';
/**
 * The database shape the rule needs — any Prisma client (or transaction)
 * satisfies it, so every service asks the SAME query.
 */
export interface OpenRoleHolderDb {
  spaceAssignment: {
    findFirst(args: unknown): Promise<{ user: { role: string; enabledModules: unknown; isExternal: boolean } } | null>;
  };
}

/**
 * Does this person hold the task's OPEN role in its workspace, right now —
 * and may they be given a job at all? (tasks/role-pool.ts)
 *
 * The read exemption for a task open to a work role: whoever may TAKE the job
 * may read it before they do. ONE rule for every surface that shows the job —
 * the API's task gate (`TaskAccessService`, `roleHolderMayRead`), its
 * attachments and report, and the live task room in notification-service. The
 * room used to refuse a holder the API let read, so the open job's page loaded
 * and then never updated.
 *
 * ⚠️ READ ONLY. Holding the role never lets anybody write. An external member,
 * or an access profile without Tasks, is never a holder.
 */
export async function holdsOpenRole(
  db: OpenRoleHolderDb,
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
      ...activeWindowWhere(now),
    },
    select: { user: { select: { role: true, enabledModules: true, isExternal: true } } },
  });
  return !!row && !row.user.isExternal && canReceiveTasks(row.user as never);
}
