import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { resolveMemberRouting } from './space-access.util';

export type NotificationCategory = 'attendance' | 'tasks';

/** true unless the recipient explicitly opted out of this category. */
function prefEnabled(prefs: unknown, category: string): boolean {
  if (!prefs || typeof prefs !== 'object') return true;
  return (prefs as Record<string, unknown>)[category] !== false;
}

/**
 * Central, DRY resolver for "who should be notified ABOUT this employee".
 *
 * Space-driven (Phase 3): recipients are the UNION of
 *   1. Explicit per-employee **watchers** (NotificationWatch) — default: none.
 *   2. The **leader roles in the employee's space(s)** — whoever holds a notify
 *      role there (the space's `notifyRoleIds`, or by default any space leader).
 * then filtered by each recipient's **notificationPrefs** opt-out; the subject is
 * always excluded. If BOTH layers are empty, a last-resort safety floor routes to
 * the org **owners (ADMINs only)** — never a broad manager blast, and never a
 * silent nowhere. `explicitOnly` keeps ONLY layer 1 (no space default, no floor).
 */
@Injectable()
export class NotificationRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWatchers(
    subjectUserId: string,
    organizationId: string,
    category: NotificationCategory = 'attendance',
    // When true, skip the admins+space-managers default — return ONLY the
    // explicitly-configured watchers (used for tasks, so a routine assignment
    // doesn't blast every admin; empty result → no watcher notification).
    explicitOnly = false,
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
    const byId = new Map<string, { id: string; email: string; notificationPrefs: unknown }>();
    for (const w of watches) {
      if (w.watcher.isActive) {
        byId.set(w.watcher.id, { id: w.watcher.id, email: w.watcher.email, notificationPrefs: w.watcher.notificationPrefs });
      }
    }

    // 2. Space-driven default: leaders in the subject's space(s). Added to (not
    // replacing) the explicit watchers, so both get notified. Skipped for
    // explicitOnly (e.g. routine task assignments).
    if (!explicitOnly) {
      // Per-member override (their space assignment) → else the space default.
      const recipientIds = await resolveMemberRouting(this.prisma, organizationId, subjectUserId, 'notify');
      const missing = [...recipientIds].filter((id) => id !== subjectUserId && !byId.has(id));
      if (missing.length) {
        const users = await this.prisma.user.findMany({
          where: { id: { in: missing }, isActive: true },
          select: { id: true, email: true, notificationPrefs: true },
        });
        for (const u of users) byId.set(u.id, u);
      }

      // Safety floor: never blackhole a member's alerts. With no watcher and no
      // space leader, route to the org OWNERS (ADMINs only — not a manager blast).
      if (byId.size === 0) {
        const admins = await this.prisma.user.findMany({
          where: { organizationId, isActive: true, role: 'ADMIN' },
          select: { id: true, email: true, notificationPrefs: true },
        });
        for (const a of admins) byId.set(a.id, a);
      }
    }

    // 3. Drop the subject + anyone who opted out of this category.
    const enabled = [...byId.values()].filter(
      (c) => c.id !== subjectUserId && prefEnabled(c.notificationPrefs, category),
    );
    return { ids: enabled.map((c) => c.id), emails: enabled.map((c) => c.email) };
  }
}
