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
 * Explicit-only (by design): recipients are the UNION of
 *   1. Explicit per-employee **watchers** (NotificationWatch) — default: none.
 *   2. Explicitly-configured space routing — the per-member `notifyUserIds`/
 *      `notifyRoleIds` override, or the space's own configured `notifyRoleIds`.
 * then filtered by each recipient's **notificationPrefs** opt-out; the subject is
 * always excluded. There is NO automatic fallback: a space with no configured
 * notify roles does not auto-blast its leaders, and an all-empty result notifies
 * no one (rather than the whole org's admins). If nobody should be alerted about
 * a member, select no one. `explicitOnly` keeps ONLY layer 1 (no space routing).
 */
@Injectable()
export class NotificationRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  // Short-TTL cache of the resolved recipient set (P13). Every clock-out/task
  // event fired ~6 uncached queries (watches + resolveMemberRouting + user
  // lookup); a burst of events about the same subject now reuses one resolution.
  // 60s tolerance per the audit — a routing change applies within a minute.
  private readonly cache = new Map<string, { v: { ids: string[]; emails: string[] }; exp: number }>();
  private static readonly TTL_MS = 60_000;

  async resolveWatchers(
    subjectUserId: string,
    organizationId: string,
    category: NotificationCategory = 'attendance',
    // When true, skip the admins+space-managers default — return ONLY the
    // explicitly-configured watchers (used for tasks, so a routine assignment
    // doesn't blast every admin; empty result → no watcher notification).
    explicitOnly = false,
  ): Promise<{ ids: string[]; emails: string[] }> {
    const cacheKey = `${organizationId}:${subjectUserId}:${category}:${explicitOnly}`;
    const now = Date.now();
    const hit = this.cache.get(cacheKey);
    if (hit && hit.exp > now) return hit.v;

    const result = await this.computeWatchers(subjectUserId, organizationId, category, explicitOnly);
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(cacheKey, { v: result, exp: now + NotificationRoutingService.TTL_MS });
    return result;
  }

  private async computeWatchers(
    subjectUserId: string,
    organizationId: string,
    category: NotificationCategory,
    explicitOnly: boolean,
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

    // 2. Explicitly-configured space routing: the per-member override, or the
    // space's own configured notify roles. Added to (not replacing) the explicit
    // watchers. allowLeaderDefault=false → an unconfigured space contributes no
    // one (no automatic all-leaders blast). Skipped entirely for explicitOnly.
    if (!explicitOnly) {
      const recipientIds = await resolveMemberRouting(
        this.prisma,
        organizationId,
        subjectUserId,
        'notify',
        false,
      );
      const missing = [...recipientIds].filter((id) => id !== subjectUserId && !byId.has(id));
      if (missing.length) {
        const users = await this.prisma.user.findMany({
          where: { id: { in: missing }, isActive: true },
          select: { id: true, email: true, notificationPrefs: true },
        });
        for (const u of users) byId.set(u.id, u);
      }
      // No safety floor: if nothing is explicitly configured, notify no one.
    }

    // 3. Drop the subject + anyone who opted out of this category.
    const enabled = [...byId.values()].filter(
      (c) => c.id !== subjectUserId && prefEnabled(c.notificationPrefs, category),
    );
    return { ids: enabled.map((c) => c.id), emails: enabled.map((c) => c.email) };
  }
}
