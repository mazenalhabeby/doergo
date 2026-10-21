import {
  Role,
  permissionsFromOrgRole,
  permissionsExceed,
  type PermissionSet,
  mayTakeOverAccount,
  loadOrgPermissionCeiling,
  SHARED_ROLE_WHERE,
} from '@hbcfield/shared';
import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { TASK_CREATION_SCOPE_RANK } from './users-common';

/**
 * The grant ceiling for member administration: nobody hands out, or takes
 * control of, more than they hold themselves — and the owner is nobody's to change.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class MemberAccessChecksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update a member's role and permissions
   */
  /**
   * Guard against privilege escalation: only an ADMIN may create/modify admins
   * or grant the user-management power. A non-admin holding `canManageUsers`
   * (e.g. a MANAGER) can still manage lower roles, but cannot mint admins or
   * touch an existing admin.
   */
  async assertCanGrantRoleAndPerms(
    requesterId: string,
    organizationId: string,
    member: { role: string },
    dto: { role?: string; canManageUsers?: boolean },
  ) {
    const requester = await this.prisma.user.findFirst({
      where: { id: requesterId, organizationId },
      select: { role: true },
    });
    if (requester?.role === Role.ADMIN) return; // admins may do anything

    const grantsAdmin = dto.role === Role.ADMIN;
    const targetIsAdmin = member.role === Role.ADMIN;
    const grantsUserMgmt = dto.canManageUsers === true || dto.role === Role.ADMIN;
    if (grantsAdmin || targetIsAdmin || grantsUserMgmt) {
      throw new ForbiddenException('Only an admin can grant or modify admin-level access');
    }
  }

  /**
   * Resolve the requester's OWN effective org-wide permission set (legacy user
   * flags ∪ their active memberRole). Returns `isAdmin` so callers can short-circuit
   * the ceiling check for true admins. Mirrors buildResolvedAccess's org branch.
   */
  async resolveRequesterOrgPerms(
    requesterId: string,
    organizationId: string,
  ): Promise<{ isAdmin: boolean; perms: PermissionSet }> {
    const ceiling = await loadOrgPermissionCeiling(this.prisma, requesterId, organizationId);
    if (!ceiling) {
      throw new ForbiddenException('Requester not found in organization');
    }
    return { isAdmin: ceiling.isAdmin, perms: ceiling.perms };
  }

  /**
   * Ceiling guard for pointing a member (or invitation) at a permission-bearing
   * AccessRole. A true ADMIN may assign any role. Anyone else — including a
   * non-admin custom role that merely holds `canManageUsers` — may only assign a
   * role whose permission set is a SUBSET of their own; otherwise they could
   * escalate past their ceiling by selecting the built-in admin role.
   */
  /**
   * The flat permission columns obey the same ceiling as a role.
   *
   * ⚠️ `canManageUsers` was guarded and its four siblings were not, so a
   * member holding only `canManageUsers` could hand somebody `canViewAllTasks`,
   * `canAssignTasks`, `canViewReports` or an org-wide task-creation scope they
   * do not hold themselves. Turning a flag OFF is never an escalation.
   */
  async assertFlatPermsWithinCeiling(
    requesterId: string,
    organizationId: string,
    /** The update being written (plain values or Prisma's `{ set }` form); only these five fields are read. */
    update: {
      [K in 'canCreateTasks' | 'canViewAllTasks' | 'canAssignTasks' | 'canViewReports' | 'taskCreationScope']?: unknown;
    },
  ) {
    // The value being written, whether plain or in Prisma's `{ set }` form — a grant cannot hide in the wrapper.
    const written = (v: unknown) => (v && typeof v === 'object' && 'set' in v ? (v as { set: unknown }).set : v);
    const data = {
      canCreateTasks: written(update.canCreateTasks),
      canViewAllTasks: written(update.canViewAllTasks),
      canAssignTasks: written(update.canAssignTasks),
      canViewReports: written(update.canViewReports),
      taskCreationScope: written(update.taskCreationScope) as string | undefined,
    };
    const flags = ['canCreateTasks', 'canViewAllTasks', 'canAssignTasks', 'canViewReports'] as const;
    const granted = flags.filter((k) => data[k] === true);
    const scopeRank = (s?: string | null) => TASK_CREATION_SCOPE_RANK[s ?? 'NONE'] ?? 0;
    // SELF is the default every non-admin role change writes; only SPACE/ORG reach others.
    const widensScope = data.taskCreationScope !== undefined && scopeRank(data.taskCreationScope) > scopeRank('SELF');
    if (granted.length === 0 && !widensScope) return;

    const { isAdmin, perms } = await this.resolveRequesterOrgPerms(requesterId, organizationId);
    if (isAdmin) return;
    const over = granted.filter((k) => !(perms as Record<string, boolean | undefined>)[k]);
    if (over.length > 0) {
      throw new ForbiddenException('You cannot grant permissions beyond your own');
    }
    if (widensScope) {
      const requester = await this.prisma.user.findFirst({
        where: { id: requesterId, organizationId },
        select: { taskCreationScope: true },
      });
      if (scopeRank(data.taskCreationScope) > scopeRank(requester?.taskCreationScope)) {
        throw new ForbiddenException('You cannot grant a task-creation scope wider than your own');
      }
    }
  }

  /** Does this member work for somebody else? One indexed lookup, one column. */
  async isExternalMember(memberId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({
      where: { id: memberId },
      select: { isExternal: true },
    });
    return u?.isExternal === true;
  }

  async assertCanAssignMemberRole(requesterId: string, organizationId: string, roleId: string) {
    const { isAdmin, perms } = await this.resolveRequesterOrgPerms(requesterId, organizationId);
    if (isAdmin) return;
    const targetRole = await this.prisma.accessRole.findFirst({
      where: { id: roleId, organizationId, ...SHARED_ROLE_WHERE },
      select: { permissions: true },
    });
    if (!targetRole) return; // invalid id → caller's own tenancy check throws
    if (permissionsExceed(perms, permissionsFromOrgRole(targetRole.permissions))) {
      throw new ForbiddenException('You cannot assign a role with permissions beyond your own');
    }
  }

  // updateMemberRole removed (dead code): it was never wired to a gateway route
  // and skipped the memberRoleId ceiling guard. All member role/permission changes
  // go through updateMemberProfile, which carries the full guard stack.

  /**
   * Remove a member from the organization
   */
  /**
   * Refuse an action that would leave the organization without its owner.
   *
   * One query, and only when the action is actually one of the dangerous ones —
   * an ordinary profile edit never reaches it. `ownerId` is a unique column on
   * the organization, so this is a primary-key lookup returning one short row.
   */
  async assertNotOwner(organizationId: string, memberId: string, verb: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    if (org?.ownerId && org.ownerId === memberId) {
      throw new BadRequestException(
        `The organization owner cannot be ${verb}. Transfer ownership to another admin first.`,
      );
    }
  }

  /**
   * Update a member's profile and/or role/permissions (combined endpoint)
   */
  /**
   * May the requester take an action that amounts to CONTROLLING this account?
   *
   * Resetting a password hands the requester a working password; changing the
   * login email hands them the reset link (forgot-password goes to the new
   * address); marking somebody external locks them out of the organization's
   * own property. Each is "becoming" the member, so each asks the same question
   * — the owner never, an admin only by an admin, nobody whose permissions reach
   * past the requester's (`mayTakeOverAccount` in shared).
   */
  async assertMayControlAccount(
    requesterId: string,
    memberId: string,
    organizationId: string,
    action: 'reset' | 'email' | 'external',
  ) {
    const [requesterAccess, targetAccess, org] = await Promise.all([
      this.resolveRequesterOrgPerms(requesterId, organizationId),
      this.resolveRequesterOrgPerms(memberId, organizationId),
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { ownerId: true } }),
    ]);
    const verdict = mayTakeOverAccount(
      { id: requesterId, ...requesterAccess },
      { id: memberId, ...targetAccess },
      org?.ownerId,
    );
    if (verdict.ok) return;
    const what =
      action === 'reset'
        ? 'reset the password of'
        : action === 'email'
          ? 'change the sign-in email of'
          : 'make external';
    throw new ForbiddenException(
      verdict.reason === 'OWNER'
        ? `Only the organization owner can ${what} the owner.`
        : verdict.reason === 'ADMIN_TARGET'
          ? `Only an admin can ${what} an admin.`
          : `You cannot ${what} somebody with permissions beyond your own.`,
    );
  }
}
