/**
 * Space-driven routing helpers (Phase 3) — shared by notification routing and
 * chat contact resolution. Everything here reads the caller's OWN spaces + the
 * space's role config server-side; no client input is trusted, so a member can
 * only ever resolve targets/recipients within spaces they truly belong to.
 */
import { isSpaceLeaderPermissions } from '@hbcfield/shared';
import type { PrismaService } from './prisma/prisma.service';

/** All active space ids a user belongs to (unified space_assignments). */
export async function spaceIdsForUser(prisma: PrismaService, userId: string): Promise<string[]> {
  const now = new Date();
  const effective = { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] };
  const assignments = await prisma.spaceAssignment.findMany({
    where: { userId, ...effective },
    select: { spaceId: true },
  });
  return [...new Set(assignments.map((a) => a.spaceId))];
}

/**
 * User ids holding a notify/contact role within the given spaces. A space's
 * explicit `notifyRoleIds`/`contactRoleIds` (unified AccessRole ids) win; when
 * empty, the default is the space's leader roles (canViewSpaceAttendance).
 */
export async function spaceRoleHolders(
  prisma: PrismaService,
  organizationId: string,
  spaceIds: string[],
  kind: 'notify' | 'contact',
  // When false, a space with NO explicit notify/contact role config contributes
  // NO one (skip the "all space leaders" automatic default). Used by the notify
  // path so an unconfigured space never auto-blasts its leaders.
  allowLeaderDefault = true,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (spaceIds.length === 0) return out;

  const spaces = await prisma.companyLocation.findMany({
    where: { id: { in: spaceIds } },
    select: { id: true, notifyRoleIds: true, contactRoleIds: true },
  });
  const cfgBySpace = new Map<string, string[]>(
    spaces.map((s) => [s.id, kind === 'notify' ? s.notifyRoleIds : s.contactRoleIds]),
  );

  const assignments = await prisma.spaceAssignment.findMany({
    where: { spaceId: { in: spaceIds }, organizationId, role: { isActive: true } },
    select: { userId: true, spaceId: true, roleId: true, role: { select: { permissions: true } } },
  });

  // Unified assignments: explicit role-id config wins; else the leader default
  // (only when allowed — the notify path opts out so nothing auto-fires).
  for (const a of assignments) {
    const cfg = cfgBySpace.get(a.spaceId) ?? [];
    const eligible = cfg.length
      ? a.roleId != null && cfg.includes(a.roleId)
      : allowLeaderDefault && isSpaceLeaderPermissions(a.role?.permissions);
    if (eligible) out.add(a.userId);
  }
  return out;
}

/**
 * Resolve routing for ONE person (Phase 4d), honoring their PER-MEMBER override
 * before the space default:
 *   • For each space the person belongs to, if their unified assignment sets a
 *     `notify`/`contact` override (specific users and/or space roles), those are
 *     the recipients FOR THAT SPACE.
 *   • Spaces without an override fall back to the space default (role config →
 *     holders, else the space leaders — via spaceRoleHolders).
 * Used symmetrically: `notify` = who is alerted ABOUT this person; `contact` =
 * who this person may reach. Reads the person's OWN assignments only — untrusted
 * input never reaches here.
 */
export async function resolveMemberRouting(
  prisma: PrismaService,
  organizationId: string,
  personId: string,
  kind: 'notify' | 'contact',
  // Threaded to spaceRoleHolders: when false, spaces without explicit routing
  // config contribute no one (no automatic all-leaders default).
  allowLeaderDefault = true,
): Promise<Set<string>> {
  const out = new Set<string>();
  const allSpaceIds = await spaceIdsForUser(prisma, personId);
  if (allSpaceIds.length === 0) return out;

  const now = new Date();
  const effective = { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] };
  const mine = await prisma.spaceAssignment.findMany({
    where: { userId: personId, organizationId, ...effective },
    select: { spaceId: true, notifyRoleIds: true, notifyUserIds: true, contactRoleIds: true, contactUserIds: true },
  });

  const overrideRoleIdsBySpace = new Map<string, string[]>();
  const overrideSpaces = new Set<string>();
  for (const a of mine) {
    const roleIds = (kind === 'notify' ? a.notifyRoleIds : a.contactRoleIds) ?? [];
    const userIds = (kind === 'notify' ? a.notifyUserIds : a.contactUserIds) ?? [];
    if (roleIds.length || userIds.length) {
      overrideSpaces.add(a.spaceId);
      for (const u of userIds) out.add(u);
      if (roleIds.length) overrideRoleIdsBySpace.set(a.spaceId, roleIds);
    }
  }

  // Override role ids → their holders within that space.
  if (overrideRoleIdsBySpace.size) {
    const holders = await prisma.spaceAssignment.findMany({
      where: { spaceId: { in: [...overrideRoleIdsBySpace.keys()] }, organizationId, role: { isActive: true } },
      select: { userId: true, spaceId: true, roleId: true },
    });
    for (const h of holders) {
      if (h.roleId && (overrideRoleIdsBySpace.get(h.spaceId) ?? []).includes(h.roleId)) out.add(h.userId);
    }
  }

  // Spaces without an override → the space default.
  const defaultSpaces = allSpaceIds.filter((s) => !overrideSpaces.has(s));
  if (defaultSpaces.length) {
    const def = await spaceRoleHolders(prisma, organizationId, defaultSpaces, kind, allowLeaderDefault);
    for (const id of def) out.add(id);
  }
  return out;
}
