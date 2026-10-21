import { HttpStatus, type Logger } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { readAssignedHome, normalizeRole, type ResolvedAccess } from '@hbcfield/shared';
import type { PrismaService } from '@hbcfield/shared';
import { resolveProfileBadges, orgPermissionFields } from './auth-common';

/** The pieces of `SessionsService.refresh`, in the order it uses them. */

export interface RefreshRefusal {
  success: false;
  statusCode: HttpStatus;
  message: string;
  code?: string;
}

/**
 * What `refresh` answers. Kept as loose as the shape TypeScript inferred from the
 * old inline literals, so callers read `data` / `message` without narrowing.
 */
export interface RefreshResult {
  success: boolean;
  statusCode?: HttpStatus;
  message?: string;
  code?: string;
  data?: { accessToken: string; refreshToken: string; user?: ReturnType<typeof refreshedUser> };
}

export function refreshRefusal(statusCode: HttpStatus, message: string, code?: string): RefreshRefusal {
  return code ? { success: false, statusCode, message, code } : { success: false, statusCode, message };
}

/** What the stored token is read with. */
export const REFRESH_TOKEN_INCLUDE = {
  user: {
    include: {
      organization: {
        select: {
          name: true,
          timezone: true,
          profileBadges: true,
          enabledModules: true,
          subStatus: true,
          planTier: true,
          addOns: true,
          currency: true,
          offlineMode: true,
          usesExternalWorkers: true,
          suspendedAt: true,
          ownerId: true,
        },
      },
      /*
        The role and space assignments, because this response REPLACES
        the mobile client's stored user (see `onUserRefreshed`).

        Without them the refresh cannot resolve access, and it was
        answering with raw columns and no `access` at all — so a member
        whose grant comes from a space role was handed their permissions
        at sign-in and lost them at the next token refresh, silently,
        mid-session. Two short indexed reads on a path that already
        loads the user.
      */
      memberRole: { select: { isActive: true, permissions: true } },
      spaceAssignments: {
        select: { spaceId: true, role: { select: { isActive: true, permissions: true } } },
      },
    },
  },
} satisfies Prisma.RefreshTokenInclude;

export type StoredRefreshToken = Prisma.RefreshTokenGetPayload<{ include: typeof REFRESH_TOKEN_INCLUDE }>;
export type RefreshUser = StoredRefreshToken['user'];

/**
 * Carry the session's refresh lifetime across rotation. Older tokens issued
 * before this change have no `rtl` claim → undefined → env default (90d).
 * The surface this session was opened from (`plat`) is carried the same way.
 * Rotation must not be a route to launder a session onto a platform the member
 * is not allowed to use.
 */
export function readRotationClaims(
  jwtService: JwtService,
  refreshToken: string,
): { refreshTtl: string | undefined; sessionPlat: string | undefined } {
  let refreshTtl: string | undefined;
  let sessionPlat: string | undefined;
  try {
    const decoded = jwtService.decode(refreshToken) as { rtl?: string; plat?: string } | null;
    if (decoded?.rtl) refreshTtl = decoded.rtl;
    if (decoded?.plat) sessionPlat = decoded.plat;
  } catch {
    /* malformed token is handled by the hash lookup below */
  }
  return { refreshTtl, sessionPlat };
}

/** The user the refresh answers with — it replaces the mobile client's stored user. */
export function refreshedUser(user: RefreshUser, refreshAccess: ResolvedAccess, spaceModules: string[]) {
  const org = user.organization;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: normalizeRole(user.role),
    organizationId: user.organizationId,
    onboardingCompleted: user.onboardingCompleted,
    isExternal: user.isExternal ?? false,
    avatarUrl: user.avatarUrl,
    /*
      Permission fields and `access` from the SAME resolution login
      uses, never the raw columns — this response replaces the mobile
      client's user, so anything answered differently here is a
      permission that changes when a token rotates.
    */
    access: refreshAccess,
    ...orgPermissionFields(refreshAccess, user.taskCreationScope),
    // See validateToken: a document type may name the roles that see it.
    memberRoleId: user.memberRoleId ?? null,
    assignedHome: readAssignedHome(user.assignedHome),
    allowRemote: user.allowRemote,
    presence: user.presence,
    specialty: user.specialty,
    profileBadges: resolveProfileBadges(user.profileBadges, org?.profileBadges),
    enabledModules: (user.enabledModules ?? org?.enabledModules) || [],
    orgModules: (org?.enabledModules as string[] | null) || [],
    spaceModules,
    subStatus: org?.suspendedAt ? 'canceled' : (org?.subStatus ?? 'ACTIVE').toString().toLowerCase(),
    planTier: org?.planTier ? org.planTier.toString().toLowerCase() : null,
    orgAddOns: org?.addOns ?? [],
    orgCurrency: org?.currency ?? 'EUR',
    // Refreshed with the session, so switching it reaches a phone within one token lifetime.
    offlineMode: org?.offlineMode ?? false,
  };
}

/*
  Beyond grace → a rotated token is being presented again.

  ⚠️ Two very different stories produce this, and the successor tells
  them apart:

  - The successor was never used. The likeliest cause is a phone that
    lost signal between the server rotating its token and the answer
    arriving — normal on a building site, and exactly what offline mode
    makes common. Revoking ALL of this member's sessions for it signed
    them out of every device because one of them lost a response.
    Only THIS chain is ended: this token and its unused successor. The
    member signs in again on this phone; their other devices, and their
    offline queue (kept for the same member), are untouched. A thief
    holding this token is locked out just the same — the successor they
    would need is gone too.

  - The successor WAS used. Two parties hold the chain: treat it as
    theft, revoke every session and record a security event (L9).
*/
export async function refuseStaleToken(prisma: PrismaService, logger: Logger, storedToken: StoredRefreshToken) {
  const successor = storedToken.replacedByTokenHash
    ? await prisma.refreshToken.findUnique({
        where: { tokenHash: storedToken.replacedByTokenHash },
        select: { id: true, usedAt: true },
      })
    : null;

  if (successor && !successor.usedAt) {
    logger.warn(
      `[SECURITY] Stale refresh token for user ${storedToken.userId} whose successor was never used ` +
        `(lost response). Ending this device's session only.`,
    );
    await prisma.refreshToken
      .deleteMany({ where: { id: { in: [storedToken.id, successor.id] } } })
      .catch((e) => logger.error('Failed to end device session on stale refresh', e));
    return refreshRefusal(
      HttpStatus.UNAUTHORIZED,
      'Your session on this device ended. Please sign in again.',
      'SESSION_ENDED',
    );
  }

  logger.warn(
    `[SECURITY] Refresh-token reuse detected for user ${storedToken.userId} ` +
      `(token used at ${storedToken.usedAt}, successor already used). Revoking every session.`,
  );
  await prisma.refreshToken
    .deleteMany({ where: { userId: storedToken.userId } })
    .catch((e) => logger.error('Failed to revoke token chain on reuse', e));
  return refreshRefusal(HttpStatus.UNAUTHORIZED, 'Token already used', 'REFRESH_TOKEN_REUSED');
}
