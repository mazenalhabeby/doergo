/**
 * Published reads of auth-service's people tables (`User`, `PlatformUser`, `SpaceShare`) — see db.ts.
 * Owner: auth-service. Columns here are a contract: changing one is a change for every caller.
 */
import { activeWindowWhere } from '../access/assignment-window';
import { memberScopeFilter } from '../access/member-scope';
import type { On } from './db';

/** Each member's stored app language (null = never told). */
export function memberLocales(db: On<'user', 'findMany'>, ids: string[]) {
  return db.user.findMany({ where: { id: { in: ids } }, select: { id: true, locale: true } });
}

/** Each member's own notification switches. */
export function memberNotificationPrefs(db: On<'user', 'findMany'>, ids: string[]) {
  return db.user.findMany({ where: { id: { in: ids } }, select: { id: true, notificationPrefs: true } });
}

/** Each member's own day zone (member → organization) — the clock push budget's day (clock review A6). */
export async function memberDayZones(db: On<'user', 'findMany'>, ids: string[]): Promise<Map<string, string | null>> {
  const rows: Array<{ id: string; timezone: string | null; organization: { timezone: string | null } | null }> =
    await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, timezone: true, organization: { select: { timezone: true } } },
    });
  return new Map(rows.map((r) => [r.id, r.timezone || r.organization?.timezone || null]));
}

/** What deciding whether a member gets an email needs: the address, who they are, both switch sets. */
export function memberEmailFacts(db: On<'user', 'findMany'>, ids: string[]) {
  return db.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      email: true,
      firstName: true,
      isActive: true,
      isExternal: true,
      role: true,
      notificationPrefs: true,
      organization: { select: { notificationPrefs: true, suspendedAt: true } },
    },
  });
}

/** Everybody whose phone reported an app version — the "a new version is out" audience. */
export function appVersionAudience(db: On<'user', 'findMany'>) {
  return db.user.findMany({
    where: { isActive: true, lastAppVersion: { not: null } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      lastAppVersion: true,
      lastAppPlatform: true,
      organization: { select: { name: true, suspendedAt: true } },
      _count: { select: { pushTokens: true } },
    },
  });
}

/** What a live connection's access is resolved from (memberAccessOf) — the same facts as a session. */
export function memberSessionFacts(db: On<'user', 'findUnique'>, userId: string, now: Date) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isActive: true,
      organizationId: true,
      tokensValidAfter: true,
      canCreateTasks: true,
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: true,
      canViewReports: true,
      organization: { select: { suspendedAt: true } },
      memberRole: { select: { permissions: true, isActive: true } },
      spaceAssignments: {
        where: { ...activeWindowWhere(now) },
        select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
      },
    },
  });
}

/** Is this person a member of the organization — and, for a workspace-scoped caller, in its crew? */
export async function memberInScope(
  db: On<'user', 'findFirst'>,
  userId: string,
  organizationId: string | undefined,
  scopeSpaceIds: string[] | undefined,
): Promise<boolean> {
  const found = await db.user.findFirst({
    where: { id: userId, ...(organizationId ? { organizationId } : {}), ...memberScopeFilter(scopeSpaceIds) },
    select: { id: true },
  });
  return !!found;
}

/** An operator (support console) as a live connection needs them. */
export function operatorSocketFacts(db: On<'platformUser', 'findUnique'>, platformUserId: string) {
  return db.platformUser.findUnique({
    where: { id: platformUserId },
    select: { isActive: true, role: true, tokensValidAfter: true, twoFactorEnabled: true },
  });
}

/** The workspaces another organization shares with this one, today. */
export function sharedSpacesFor(db: On<'spaceShare', 'findMany'>, guestOrgId: string) {
  return db.spaceShare.findMany({ where: { guestOrgId, status: 'ACTIVE' }, select: { spaceId: true } });
}

/** One member's own zone and their organization's, KEPT APART — for an order that puts a workspace between them. */
export async function memberZoneSources(
  db: On<'user', 'findUnique'>,
  id: string,
): Promise<{ member: string | null; organization: string | null }> {
  const u: { timezone: string | null; organization: { timezone: string | null } | null } | null =
    await db.user.findUnique({ where: { id }, select: { timezone: true, organization: { select: { timezone: true } } } });
  return { member: u?.timezone ?? null, organization: u?.organization?.timezone ?? null };
}
