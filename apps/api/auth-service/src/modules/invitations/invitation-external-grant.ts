import { HttpStatus } from '@nestjs/common';
import {
  Role,
  permissionsFromOrgRole,
  permissionsExceed,
  loadOrgPermissionCeiling,
  loadSpacePermissionCeiling,
  externalForbiddenIn,
  whitelistPermissions,
  SPACE_PERMISSION_KEYS,
  SHARED_ROLE_WHERE,
  PERMISSION_KEYS,
  type PermissionSet,
  workspaceInOrg,
  type PrismaService,
} from '@hbcfield/shared';

/**
 * What an EXTERNAL invitation may hand its invitee in its workspace — a
 * shared SPACE role (`memberRoleId`) or a set of keys (`spacePermissions`),
 * never both, never an org role and never somebody's personal role.
 *
 * Three checks, the same ones the permission builder's writer applies on the
 * member: workspace keys only (an org key set to true is refused, not
 * dropped), the external allow-list, and the inviter's own ceiling IN THAT
 * WORKSPACE (org grants ∪ their assignment there). The ceiling on a named
 * space role is new: it was missing, so a member manager could invite an
 * outsider straight into a role above their own.
 */
export async function checkExternalSpaceGrant(
  prisma: PrismaService,
  data: {
    organizationId: string;
    createdById: string;
    targetRole: string;
    spaceId?: string;
    memberRoleId?: string;
    spacePermissions?: unknown;
  },
  creatorIsAdmin: boolean,
  inviteIsExternal: boolean,
): Promise<
  | { memberRoleId: string | null; spacePermissions: PermissionSet | null }
  | {
      refusal: {
        success: false;
        statusCode: number;
        message: string;
        code?: string;
        params?: Record<string, unknown>;
      };
    }
> {
  const refuse = (statusCode: number, message: string, code?: string, params?: Record<string, unknown>) => ({
    refusal: {
      success: false as const,
      statusCode,
      message,
      ...(code ? { code } : {}),
      ...(params ? { params } : {}),
    },
  });
  const hasKeys = data.spacePermissions != null;
  if (hasKeys && (!inviteIsExternal || data.targetRole !== Role.EMPLOYEE)) {
    return refuse(
      HttpStatus.BAD_REQUEST,
      'Workspace permissions are for an external member',
      'SPACE_PERMISSIONS_EXTERNAL_ONLY',
    );
  }
  if (hasKeys && data.memberRoleId) {
    return refuse(HttpStatus.BAD_REQUEST, 'Send either a role or a set of permissions', 'PERMISSIONS_CHOICE_INVALID');
  }

  // The ceiling the inviter grants within: their workspace ceiling when the invite names one.
  const ceilingOf = async (): Promise<PermissionSet | null> => {
    if (creatorIsAdmin) return null;
    const c = data.spaceId
      ? await loadSpacePermissionCeiling(prisma, data.createdById, data.organizationId, data.spaceId)
      : await loadOrgPermissionCeiling(prisma, data.createdById, data.organizationId);
    if (c?.isAdmin) return null;
    return c?.perms ?? {};
  };
  const checkGrant = async (perms: PermissionSet) => {
    const forbidden = externalForbiddenIn(perms);
    if (forbidden.length) {
      return refuse(
        HttpStatus.BAD_REQUEST,
        'An external member cannot be given these permissions',
        'EXTERNAL_PERMISSION_FORBIDDEN',
        { keys: forbidden },
      );
    }
    const ceiling = await ceilingOf();
    if (ceiling && permissionsExceed(ceiling, perms)) {
      const over = PERMISSION_KEYS.filter((k) => perms[k] === true && ceiling[k] !== true);
      return refuse(HttpStatus.FORBIDDEN, 'You cannot grant permissions beyond your own', 'GRANT_EXCEEDS_OWN', {
        keys: over,
      });
    }
    return null;
  };

  if (hasKeys) {
    // Permissions in a workspace need the workspace — one of THIS organization, still open.
    if (!data.spaceId) {
      return refuse(
        HttpStatus.BAD_REQUEST,
        'Choose the workspace these permissions are for',
        'SPACE_PERMISSIONS_NEED_SPACE',
      );
    }
    const space = await workspaceInOrg(prisma, data.spaceId, data.organizationId, { activeOnly: true });
    if (!space) return refuse(HttpStatus.NOT_FOUND, 'Workspace not found');
    const raw = data.spacePermissions;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return refuse(HttpStatus.BAD_REQUEST, 'Permissions must be an object of keys', 'PERMISSION_KEY_NOT_IN_SPACE');
    }
    // Refused as a whole, never filtered: a dropped key reads as granted on the screen that sent it.
    const spaceKeys = new Set<string>(SPACE_PERMISSION_KEYS);
    const wrong = Object.entries(raw as Record<string, unknown>)
      .filter(([k, v]) => typeof v !== 'boolean' || (v === true && !spaceKeys.has(k)))
      .map(([k]) => k);
    if (wrong.length) {
      return refuse(
        HttpStatus.BAD_REQUEST,
        'These permissions cannot be given in a workspace',
        'PERMISSION_KEY_NOT_IN_SPACE',
        { keys: wrong },
      );
    }
    const perms = whitelistPermissions(raw, 'space');
    if (!Object.keys(perms).length) {
      // An outsider holding nothing signs in to empty screens — the failure this field exists to prevent.
      return refuse(HttpStatus.BAD_REQUEST, 'Give this person at least one permission', 'SPACE_PERMISSIONS_EMPTY');
    }
    const problem = await checkGrant(perms);
    if (problem) return problem;
    return { memberRoleId: null, spacePermissions: perms };
  }

  /*
    An external invitation may name a role — it must simply be a SHARED SPACE
    role (never an org role, never one person's personal role, never a trade).

    There are two kinds of outsider: a Supervisor who approves our hours and
    follows the work, and an Observer who watches and can raise a job. Which
    one they are is the whole difference between them, so it is chosen when
    they are invited rather than corrected afterwards.

    The value lands on their SPACE ASSIGNMENT, never on `User.memberRoleId` —
    `memberFieldsFromInvitation` forces that null for an external member, so
    the org-wide field cannot be reached even if this validation were wrong.

    ⚠️ It used to be validated here and then looked up AGAIN as an org role,
    which refused every space role with "Invalid role" — an external
    invitation could only ever arrive with the default role.
  */
  if (data.memberRoleId) {
    const spaceRole = await prisma.accessRole.findFirst({
      where: {
        id: data.memberRoleId,
        organizationId: data.organizationId,
        isActive: true,
        scope: 'SPACE',
        kind: { not: 'WORK' },
        ...SHARED_ROLE_WHERE,
      },
      select: { id: true, permissions: true },
    });
    if (!spaceRole) return refuse(HttpStatus.BAD_REQUEST, 'An external member can only be given a workspace role');
    const problem = await checkGrant(permissionsFromOrgRole(spaceRole.permissions));
    if (problem) return problem;
    return { memberRoleId: spaceRole.id, spacePermissions: null };
  }
  return { memberRoleId: null, spacePermissions: null };
}
