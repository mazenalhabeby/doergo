/**
 * Space-driven routing helpers (Phase 3) — shared by notification routing and
 * chat contact resolution. Everything here reads the caller's OWN spaces + the
 * space's role config server-side; no client input is trusted, so a member can
 * only ever resolve targets/recipients within spaces they truly belong to.
 */
import { isSpaceLeaderPermissions } from '@hbcfield/shared';
import type { PrismaService } from './prisma/prisma.service';

/** All active space ids a user belongs to (unified assignment + legacy tables). */
export async function spaceIdsForUser(prisma: PrismaService, userId: string): Promise<string[]> {
  const now = new Date();
  const effective = { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] };
  const [assignments, techAssigns, members] = await Promise.all([
    prisma.spaceAssignment.findMany({ where: { userId, ...effective }, select: { spaceId: true } }),
    prisma.technicianAssignment.findMany({ where: { userId, ...effective }, select: { locationId: true } }),
    prisma.spaceMember.findMany({ where: { userId }, select: { spaceId: true } }),
  ]);
  const set = new Set<string>();
  for (const a of assignments) set.add(a.spaceId);
  for (const t of techAssigns) set.add(t.locationId);
  for (const m of members) set.add(m.spaceId);
  return [...set];
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

  const [members, assignments] = await Promise.all([
    prisma.spaceMember.findMany({
      where: { spaceId: { in: spaceIds }, spaceRole: { isActive: true } },
      select: { userId: true, spaceRole: { select: { permissions: true } } },
    }),
    prisma.spaceAssignment.findMany({
      where: { spaceId: { in: spaceIds }, organizationId, role: { isActive: true } },
      select: { userId: true, spaceId: true, roleId: true, role: { select: { permissions: true } } },
    }),
  ]);

  // Legacy space members resolve by the leader-permission default only (their
  // roles are separate ids from the unified config).
  for (const m of members) {
    if (isSpaceLeaderPermissions(m.spaceRole?.permissions)) out.add(m.userId);
  }
  // Unified assignments: explicit role-id config wins, else leader default.
  for (const a of assignments) {
    const cfg = cfgBySpace.get(a.spaceId) ?? [];
    const eligible = cfg.length
      ? a.roleId != null && cfg.includes(a.roleId)
      : isSpaceLeaderPermissions(a.role?.permissions);
    if (eligible) out.add(a.userId);
  }
  return out;
}
