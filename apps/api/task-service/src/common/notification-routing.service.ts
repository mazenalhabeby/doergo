import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export type NotificationCategory = 'attendance' | 'tasks';

/** true unless the recipient explicitly opted out of this category. */
function prefEnabled(prefs: unknown, category: string): boolean {
  if (!prefs || typeof prefs !== 'object') return true;
  return (prefs as Record<string, unknown>)[category] !== false;
}

/**
 * Central, DRY resolver for "who should be notified ABOUT this employee".
 *
 * Replaces the old flat `role=ADMIN OR canViewAllTasks` blast. Every
 * manager-alert event (attendance approval, geofence, and future per-employee
 * alerts) resolves recipients here, applying three layers in order:
 *   1. Explicit per-employee **watchers** (NotificationWatch) → override.
 *   2. Default: org **admins** + **managers assigned to the employee's space(s)**
 *      (self-maintaining; falls back to all managers if the employee has no space).
 *   3. Each recipient's **notificationPrefs** opt-out for the category.
 * The subject is always excluded.
 */
@Injectable()
export class NotificationRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWatchers(
    subjectUserId: string,
    organizationId: string,
    category: NotificationCategory = 'attendance',
  ): Promise<{ ids: string[]; emails: string[] }> {
    // 1. Explicit per-employee watchers override the default routing entirely.
    const watches = await this.prisma.notificationWatch.findMany({
      where: { subjectUserId, organizationId },
      select: {
        watcher: {
          select: { id: true, email: true, isActive: true, notificationPrefs: true },
        },
      },
    });
    let candidates: Array<{ id: string; email: string; notificationPrefs: unknown }> = watches
      .map((w) => w.watcher)
      .filter((w) => w.isActive)
      .map((w) => ({ id: w.id, email: w.email, notificationPrefs: w.notificationPrefs }));

    // 2. Default routing when no explicit watchers: admins + space managers.
    if (candidates.length === 0) {
      const spaces = await this.prisma.technicianAssignment.findMany({
        where: {
          userId: subjectUserId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        select: { locationId: true },
      });
      const spaceIds = spaces.map((s) => s.locationId);

      const users = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          OR: [
            { role: 'ADMIN' }, // org owners always receive
            spaceIds.length
              ? // managers who share one of the subject's spaces
                { canViewAllTasks: true, assignments: { some: { locationId: { in: spaceIds } } } }
              : // subject has no space → fall back to all managers (previous behaviour)
                { canViewAllTasks: true },
          ],
        },
        select: { id: true, email: true, notificationPrefs: true },
      });
      candidates = users;
    }

    // 3. Drop the subject + anyone who opted out of this category.
    const enabled = candidates.filter(
      (c) => c.id !== subjectUserId && prefEnabled(c.notificationPrefs, category),
    );
    return { ids: enabled.map((c) => c.id), emails: enabled.map((c) => c.email) };
  }
}
