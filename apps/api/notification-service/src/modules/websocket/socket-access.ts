import { buildResolvedAccess, canAccessTask, holdsOpenRole, tokenIssuedBeforeCutoff, type ResolvedAccess } from '@hbcfield/shared';

/**
 * What a socket's user may see — resolved from the DATABASE, the same way the
 * auth service resolves a session (`buildResolvedAccess` over the org role and
 * the space assignments in force today), never from the token's claims.
 *
 * ⚠️ The token carries a `canViewAllTasks` claim minted from the LEGACY user
 * column at sign-in. It says nothing about a grant held through a role, it is
 * not refreshed when an admin changes a role, and with ACCESS_IGNORE_LEGACY_FLAGS
 * on it is not what the API itself enforces. A room derived from it could hand
 * every org-wide task event to somebody the API would refuse.
 *
 * Returns null when the account cannot be on a socket at all: gone, switched
 * off, moved to another organization, its organization is suspended — or the
 * token was minted before the account's session cut-off (`tokensValidAfter`:
 * a password change, "sign out everywhere"). The API refuses such a token on
 * its next request; a socket opened with it used to keep receiving the
 * organization's events until the token's own `exp`.
 */
export interface SocketAccess {
  role: string;
  access: ResolvedAccess;
}

/** The same switch auth.service reads — both must agree, see ignoreLegacyFlags there. */
const ignoreLegacyFlags = () => process.env.ACCESS_IGNORE_LEGACY_FLAGS === 'true';

type PrismaLike = {
  user: { findUnique: (args: any) => Promise<any> };
  task: { findFirst: (args: any) => Promise<any> };
  spaceAssignment: { findFirst: (args: any) => Promise<any> };
};

export async function resolveSocketAccess(
  prisma: PrismaLike,
  userId: string,
  organizationId: string,
  /** The socket's token `iat` (seconds). Omitted only by callers with no token. */
  tokenIat?: number,
): Promise<SocketAccess | null> {
  const now = new Date();
  const user = await prisma.user.findUnique({
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
        where: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
        select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
      },
    },
  });
  if (!user || !user.isActive || user.organizationId !== organizationId) return null;
  if (user.organization?.suspendedAt) return null;
  if (tokenIat !== undefined && tokenIssuedBeforeCutoff(tokenIat, user.tokensValidAfter)) return null;

  const access = buildResolvedAccess({
    isAdmin: user.role === 'ADMIN',
    userFlags: ignoreLegacyFlags()
      ? undefined
      : {
          canCreateTasks: user.canCreateTasks,
          canViewAllTasks: user.canViewAllTasks,
          canAssignTasks: user.canAssignTasks,
          canManageUsers: user.canManageUsers,
          canViewReports: user.canViewReports,
        },
    memberRolePermissions: user.memberRole?.isActive ? user.memberRole.permissions : undefined,
    spaces: (user.spaceAssignments ?? []).map((a: any) => ({
      spaceId: a.spaceId,
      permissions: a.role?.isActive ? a.role.permissions : undefined,
    })),
  });
  return { role: user.role, access };
}

/**
 * May this socket's user open this task — the API's own rule (`canAccessTask`
 * in shared), asked of the task's real organization, space and assignees.
 *
 * Same-organization only: a guest organization's members receive a shared
 * space's live events through `space:{id}`, which is resolved from the share
 * at authenticate; a task room is not a way across the boundary.
 *
 * A task OPEN TO A WORK ROLE is also readable by whoever holds that role in
 * its workspace (shared `holdsOpenRole`, the rule the API's task gate applies
 * with `roleHolderMayRead`). The room is read-only, so the exemption applies
 * in full — asked last, only after the normal rule said no.
 */
export async function socketMayOpenTask(
  prisma: PrismaLike,
  caller: { userId: string; organizationId: string } & SocketAccess,
  taskId: string,
): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: caller.organizationId },
    select: {
      organizationId: true,
      spaceId: true,
      assignedToId: true,
      assignees: { select: { userId: true } },
      openRoleId: true,
      openSpotsLeft: true,
      status: true,
    },
  });
  if (!task) return false;
  const viewAll = caller.access.org?.canViewAllTasks === true;
  const viewAllSpaceIds = Object.keys(caller.access.perSpace ?? {}).filter(
    (id) => caller.access.perSpace[id]?.canViewAllTasks === true,
  );
  if (
    canAccessTask(task, {
      userId: caller.userId,
      userRole: caller.role,
      organizationId: caller.organizationId,
      canViewAllTasks: viewAll,
      viewAllSpaceIds,
    })
  ) {
    return true;
  }
  return holdsOpenRole(prisma, task, caller.userId);
}

/**
 * May this verified operator token open a support-agent socket?
 *
 * The signature alone used to decide, with the role the token was minted with.
 * An operator switched off, or whose password was changed (which moves
 * `tokensValidAfter` — the way an operator is thrown out everywhere), kept a
 * live seat in every customer's support chat until the token's own `exp`. The
 * API's guard (platform-auth validateToken) already refused that token; the
 * socket now asks the same three questions of the DATABASE: does the operator
 * exist, are they active, was the token minted after the cut-off — and reads
 * their CURRENT role for the capability.
 */
export async function operatorMaySupport(
  prisma: { platformUser: { findUnique: (args: any) => Promise<any> } },
  payload: { sub?: unknown; iat?: unknown; typ?: unknown } | null | undefined,
  can: (role: string, capability: 'manageSupport') => boolean,
): Promise<boolean> {
  if (!payload || payload.typ !== 'platform' || typeof payload.sub !== 'string' || !payload.sub) return false;
  const op = await prisma.platformUser.findUnique({
    where: { id: payload.sub },
    select: { isActive: true, role: true, tokensValidAfter: true },
  });
  if (!op || !op.isActive) return false;
  if (tokenIssuedBeforeCutoff(typeof payload.iat === 'number' ? payload.iat : 0, op.tokensValidAfter)) return false;
  return can(op.role, 'manageSupport');
}
