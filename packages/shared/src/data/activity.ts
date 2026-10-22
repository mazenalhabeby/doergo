/**
 * Published reads of the activity log (`ActivityLog`: owned by auth-service, appended to by every service)
 * — see db.ts.
 */
import type { On } from './db';

/** Has this event been logged for this record by this person? */
export async function activityLogged(
  db: On<'activityLog', 'findFirst'>,
  input: { resourceId: string; eventType: string; userId: string },
): Promise<boolean> {
  return !!(await db.activityLog.findFirst({ where: input, select: { id: true } }));
}

/** A record's latest 100 events of one kind, with who did each. */
export function recordHistory(
  db: On<'activityLog', 'findMany'>,
  input: { resourceId: string; organizationId: string; eventType: string },
) {
  return db.activityLog.findMany({
    where: input,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { firstName: true, lastName: true } } },
  });
}
