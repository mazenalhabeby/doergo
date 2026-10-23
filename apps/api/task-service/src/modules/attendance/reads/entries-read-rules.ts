import type { PrismaService } from '@hbcfield/shared';
import { activeAssignmentWhere } from '@hbcfield/shared';
import { scopeAllows, type AttendanceScope } from '@hbcfield/shared';
import type { Prisma } from '@prisma/client';

/**
 * What the entry reads share: who may see a workspace's hours, and the order a
 * list of entries is sorted in.
 */

/**
 * May this caller read the attendance of one workspace?
 *
 * `scope` is where they hold `canViewSpaceAttendance` (null = org-wide). A
 * space-scoped grant comes from a space assignment, so it is honoured only
 * while that assignment is active (`activeAssignmentWhere` — the same window
 * the clock-in uses): a supervisor whose engagement ended yesterday reads
 * nothing today, whatever a cached session still says.
 */
export async function mayViewSpaceAttendance(
  prisma: PrismaService,
  spaceId: string,
  userId: string | undefined,
  scope: AttendanceScope,
): Promise<boolean> {
  if (scope === null || scope === undefined) return true;
  if (!userId || !scopeAllows(scope, spaceId)) return false;
  const active = await prisma.spaceAssignment.findFirst({
    where: { spaceId, ...activeAssignmentWhere(userId) },
    select: { id: true },
  });
  return !!active;
}

/**
 * Map a UI sort key → Prisma orderBy for the entries list. Defaults to newest
 * clock-in first. `totalMinutes`/`clockOutAt` are nullable → nulls sort last.
 */
export function entriesOrderBy(
  sortBy?: string,
  sortOrder?: string,
): Prisma.TimeEntryOrderByWithRelationInput | Prisma.TimeEntryOrderByWithRelationInput[] {
  const dir: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : 'desc';
  // Smart "sort by day": every non-chronological sort gets clock-in (newest day
  // first) as a secondary tie-breaker, so a worker's / status's rows always fall
  // into day order instead of an arbitrary within-group order. Invisible in the
  // UI — same columns, same rows — but the list is always day-coherent.
  const byDay = { clockInAt: 'desc' as const };
  switch (sortBy) {
    case 'worker':
      return [{ user: { firstName: dir } }, { user: { lastName: dir } }, byDay];
    case 'status':
      return [{ status: dir }, byDay];
    case 'clockIn':
      return { clockInAt: dir };
    case 'clockOut':
      return [{ clockOutAt: { sort: dir, nulls: 'last' } }, byDay];
    case 'duration':
      return [{ totalMinutes: { sort: dir, nulls: 'last' } }, byDay];
    case 'approval':
      return [{ approvalStatus: dir }, byDay];
    default:
      return byDay;
  }
}
