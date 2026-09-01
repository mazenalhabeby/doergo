/**
 * Space-driven routing: who is told about a member, who a member may reach, and
 * who signs off for them.
 *
 * Everything here reads the SUBJECT's own spaces and the space's role config
 * server-side. No client input is trusted, so a member can only ever resolve
 * targets within spaces they truly belong to.
 *
 * Lives in shared rather than in one service because two of them need the same
 * answer: task-service routes notifications and chat contacts, and auth-service
 * has to resolve who approves a member's document. Two copies of this rule would
 * drift, and the day they disagreed nobody would know which was right.
 */
import { isSpaceLeaderPermissions } from '../types/permissions';

/**
 * The three questions this resolver answers, which are deliberately separate.
 *
 *   notify   who is alerted ABOUT this person
 *   contact  who this person may reach
 *   approve  who signs off FOR this person
 *
 * `approve` is not a synonym for `notify`. Wanting to hear about somebody's
 * shifts is not the same as having authority over their hours, and collapsing
 * the two would hand sign-off to everyone who ever asked to be kept informed.
 */
export type RoutingKind = 'notify' | 'contact' | 'approve';

/**
 * Only what this module touches.
 *
 * Structural rather than a PrismaService class: both services extend the same
 * generated client, and naming either one here would make shared depend on a
 * service. It also states plainly which tables this reads.
 */
export interface RoutingPrisma {
  spaceAssignment: { findMany(args: any): Promise<any[]> };
  companyLocation: { findMany(args: any): Promise<any[]> };
}

/** The per-member override columns for one kind. */
function overrideColumns(kind: RoutingKind): { roleIds: string; userIds: string } {
  switch (kind) {
    case 'contact':
      return { roleIds: 'contactRoleIds', userIds: 'contactUserIds' };
    case 'approve':
      return { roleIds: 'approveRoleIds', userIds: 'approveUserIds' };
    default:
      return { roleIds: 'notifyRoleIds', userIds: 'notifyUserIds' };
  }
}

/** The space-level default column for one kind. */
function spaceColumn(kind: RoutingKind): string {
  return kind === 'contact' ? 'contactRoleIds' : kind === 'approve' ? 'approveRoleIds' : 'notifyRoleIds';
}

/**
 * All active space ids a user belongs to (unified space_assignments).
 *
 * Kept for callers that need only the ids. Do NOT reach for it alongside a read
 * of the same person's assignments — that is the duplicate, sequential pair
 * resolveMemberRouting used to pay for. Select the extra columns instead.
 */
export async function spaceIdsForUser(prisma: RoutingPrisma, userId: string): Promise<string[]> {
  const now = new Date();
  const effective = { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] };
  const assignments = await prisma.spaceAssignment.findMany({
    where: { userId, ...effective },
    select: { spaceId: true },
  });
  return [...new Set(assignments.map((a: any) => a.spaceId as string))];
}

/** One assignment, as the eligibility rule needs to see it. */
export interface RoutingAssignment {
  userId: string;
  spaceId: string;
  roleId: string | null;
  role?: { permissions: unknown } | null;
}

/**
 * Who, among these assignments, is a routing target — pure.
 *
 * Separated from fetching so the same decision serves callers that hold one
 * query's worth of rows and callers that hold several spaces' worth, without
 * either of them re-stating the rule. Explicit role-id config wins; otherwise
 * the space leaders, and only when the caller allows that default (the notify
 * path opts out so an unconfigured space never auto-blasts).
 */
export function eligibleRoutingTargets(
  assignments: RoutingAssignment[],
  cfgBySpace: Map<string, string[]>,
  allowLeaderDefault: boolean,
): Set<string> {
  const out = new Set<string>();
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
 * User ids holding a routing role within the given spaces. A space's explicit
 * role config (unified AccessRole ids) wins; when empty, the default is the
 * space's leader roles (canViewSpaceAttendance).
 */
export async function spaceRoleHolders(
  prisma: RoutingPrisma,
  organizationId: string,
  spaceIds: string[],
  kind: RoutingKind,
  // When false, a space with NO explicit role config contributes NO one (skip
  // the "all space leaders" automatic default). Used by the notify path so an
  // unconfigured space never auto-blasts its leaders.
  allowLeaderDefault = true,
): Promise<Set<string>> {
  if (spaceIds.length === 0) return new Set<string>();

  const col = spaceColumn(kind);

  const [spaces, assignments] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { id: { in: spaceIds } },
      select: { id: true, notifyRoleIds: true, contactRoleIds: true, approveRoleIds: true },
    }),
    prisma.spaceAssignment.findMany({
      where: { spaceId: { in: spaceIds }, organizationId, role: { isActive: true } },
      select: { userId: true, spaceId: true, roleId: true, role: { select: { permissions: true } } },
    }),
  ]);

  const cfgBySpace = new Map<string, string[]>(
    spaces.map((s: any) => [s.id as string, (s[col] ?? []) as string[]]),
  );
  return eligibleRoutingTargets(assignments as RoutingAssignment[], cfgBySpace, allowLeaderDefault);
}

/**
 * Resolve routing for ONE person, honouring their PER-MEMBER override before
 * the space default:
 *   • For each space the person belongs to, if their unified assignment sets an
 *     override for this kind (specific users and/or space roles), those are the
 *     recipients FOR THAT SPACE.
 *   • Spaces without an override fall back to the space default (role config →
 *     holders, else the space leaders — via spaceRoleHolders).
 *
 * Reads the person's OWN assignments only — untrusted input never reaches here.
 */
export async function resolveMemberRouting(
  prisma: RoutingPrisma,
  organizationId: string,
  personId: string,
  kind: RoutingKind,
  // Threaded to the eligibility rule: when false, spaces without explicit
  // routing config contribute no one (no automatic all-leaders default).
  allowLeaderDefault = true,
): Promise<Set<string>> {
  const out = new Set<string>();
  const { roleIds: roleCol, userIds: userCol } = overrideColumns(kind);
  const spaceCol = spaceColumn(kind);

  // The person's own assignments, ONCE. This used to be two reads of the same
  // rows — spaceIdsForUser for the ids, then the same query again for the
  // override columns — one after the other, so it cost two round trips as well
  // as two queries. The organization filter is applied here instead of in SQL
  // to keep the previous meaning exactly: the full set (unfiltered) decides
  // which spaces are in play, the org-scoped subset decides overrides.
  const now = new Date();
  const mineAll = await prisma.spaceAssignment.findMany({
    where: { userId: personId, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
    select: {
      spaceId: true,
      organizationId: true,
      notifyRoleIds: true,
      notifyUserIds: true,
      contactRoleIds: true,
      contactUserIds: true,
      approveRoleIds: true,
      approveUserIds: true,
    },
  });
  if (mineAll.length === 0) return out;

  const allSpaceIds = [...new Set(mineAll.map((a: any) => a.spaceId as string))];
  const mine = mineAll.filter((a: any) => a.organizationId === organizationId);

  const overrideRoleIdsBySpace = new Map<string, string[]>();
  const overrideSpaces = new Set<string>();
  for (const a of mine as any[]) {
    const roleIds: string[] = a[roleCol] ?? [];
    const userIds: string[] = a[userCol] ?? [];
    if (roleIds.length || userIds.length) {
      overrideSpaces.add(a.spaceId);
      for (const u of userIds) out.add(u);
      if (roleIds.length) overrideRoleIdsBySpace.set(a.spaceId, roleIds);
    }
  }

  const defaultSpaces = allSpaceIds.filter((s) => !overrideSpaces.has(s));
  const roleOverrideSpaces = [...overrideRoleIdsBySpace.keys()];
  const relevantSpaces = [...new Set([...roleOverrideSpaces, ...defaultSpaces])];
  if (relevantSpaces.length === 0) return out;

  // Every space's holders in one read, and the role config alongside it. These
  // were two sequential queries against the same table, on disjoint space sets;
  // one read covers both, and the space config no longer waits behind it.
  const [spaces, holders] = await Promise.all([
    defaultSpaces.length
      ? prisma.companyLocation.findMany({
          where: { id: { in: defaultSpaces } },
          select: { id: true, notifyRoleIds: true, contactRoleIds: true, approveRoleIds: true },
        })
      : Promise.resolve([] as any[]),
    prisma.spaceAssignment.findMany({
      where: { spaceId: { in: relevantSpaces }, organizationId, role: { isActive: true } },
      select: { userId: true, spaceId: true, roleId: true, role: { select: { permissions: true } } },
    }),
  ]);

  // A space the person overrode by role id: only those roles count, and the
  // leader default never applies there.
  const overrideHolders = (holders as any[]).filter((h) => overrideRoleIdsBySpace.has(h.spaceId));
  for (const id of eligibleRoutingTargets(
    overrideHolders as RoutingAssignment[],
    overrideRoleIdsBySpace,
    false,
  )) {
    out.add(id);
  }

  // Spaces without an override → the space default (config → holders, else
  // leaders when allowed).
  if (defaultSpaces.length) {
    const defaultSpaceSet = new Set(defaultSpaces);
    const cfgBySpace = new Map<string, string[]>(
      (spaces as any[]).map((s) => [s.id as string, (s[spaceCol] ?? []) as string[]]),
    );
    const defaultHolders = (holders as any[]).filter((h) => defaultSpaceSet.has(h.spaceId));
    for (const id of eligibleRoutingTargets(
      defaultHolders as RoutingAssignment[],
      cfgBySpace,
      allowLeaderDefault,
    )) {
      out.add(id);
    }
  }

  return out;
}
