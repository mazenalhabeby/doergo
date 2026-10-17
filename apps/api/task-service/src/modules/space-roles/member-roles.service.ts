import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { assertSpaceInOrg } from '../../common/tenant-scope.util';
import {
  success,
  permissionsExceed,
  permissionsFromOrgRole,
  externalForbiddenIn,
  permissionLabel,
  isBillBy,
  roleComboProblem,
  effectiveBillBy,
  type PermissionSet,
  type BillByValue,
  type RoleKindValue,
  effectiveHoursBasis,
  isHoursBasis,
  type HoursBasis,
  setAssignmentPermissions,
  readAssignmentPermissions,
  type AssignmentPermissionsChoice,
} from '@hbcfield/shared';
import {
  userSelect,
  roleSelect,
  SpaceMemberAuthority,
  authorityRefusal,
  toHttp,
  comboRefusal,
} from './space-roles-helpers';
import { SpaceRolesBase } from './space-roles.base';

/** A member's roles and permissions in one workspace, and taking them out. */
@Injectable()
export class MemberRolesService extends SpaceRolesBase {
  /**
   * A member's roles and billing here, edited in place: their trade, their
   * management role, whether they may hold both, and how they are billed.
   *
   * ⚠️ Undefined leaves a field alone; null clears it.
   *
   * ⚠️ The management role is the only part that is AUTHORITY, so it gets the
   * same two checks `assignMember` applies — the external allow-list and the
   * grant ceiling. The trade grants nothing and needs neither.
   */
  async updateMemberRoles(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    workRoleId?: string | null;
    managementRoleId?: string | null;
    allowSecondRole?: boolean;
    billBy?: BillByValue | null;
    hoursBasis?: HoursBasis | null;
    requesterPerms?: PermissionSet | null;
    /** What the caller may change here (see SpaceMemberAuthority). Absent = everything. */
    authority?: SpaceMemberAuthority;
    /** The caller acts through a grant in this workspace only (see assignMember). */
    outrankCheck?: boolean;
  }) {
    const member = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
      include: { user: { select: { isExternal: true } }, role: true, workRole: true },
    });
    if (!member) throw new NotFoundException('Space member not found');
    const may: SpaceMemberAuthority = data.authority ?? { addMembers: true, grantRoles: true, manageTerms: true };
    // The trade, the two-role switch and the billing terms are the space's people management (canManageUsers here).
    const touchesTerms = [data.workRoleId, data.allowSecondRole, data.billBy, data.hoursBasis].some((v) => v !== undefined);
    if (touchesTerms && !may.manageTerms) throw authorityRefusal("change people's trade or billing");
    if (data.managementRoleId !== undefined && (data.managementRoleId ?? null) !== (member.roleId ?? null)) {
      if (!may.grantRoles) throw authorityRefusal('give roles');
      if (data.outrankCheck && data.requesterPerms && member.role
        && permissionsExceed(data.requesterPerms, permissionsFromOrgRole(member.role.permissions))) {
        throw new ForbiddenException({ message: 'This person holds more in this workspace than you do', code: 'MEMBER_ABOVE_YOU' });
      }
    }

    const workRole =
      data.workRoleId === undefined
        ? member.workRole
        : data.workRoleId === null
          ? null
          : await this.getOwnedRole(data.organizationId, data.workRoleId);
    const mgmtRole =
      data.managementRoleId === undefined
        ? member.role
        : data.managementRoleId === null
          ? null
          : await this.getOwnedRole(data.organizationId, data.managementRoleId, { assignmentId: member.id });
    const allowSecondRole = data.allowSecondRole ?? member.allowSecondRole;

    const problem = roleComboProblem({
      workRoleKind: (workRole?.kind as RoleKindValue | undefined) ?? null,
      managementRoleKind: (mgmtRole?.kind as RoleKindValue | undefined) ?? null,
      hasWorkRole: !!workRole,
      hasManagementRole: !!mgmtRole,
      allowSecondRole,
      isExternal: member.user?.isExternal === true,
    });
    if (problem) throw comboRefusal(problem);

    if (data.managementRoleId && mgmtRole && mgmtRole.id !== member.roleId) {
      if (member.user?.isExternal) {
        const forbidden = externalForbiddenIn(permissionsFromOrgRole(mgmtRole.permissions));
        if (forbidden.length) {
          throw new ForbiddenException(
            `This role cannot be given to an external member — it grants ${forbidden.map((k) => permissionLabel(k)).join(', ')}`,
          );
        }
      }
      if (data.requesterPerms && permissionsExceed(data.requesterPerms, permissionsFromOrgRole(mgmtRole.permissions))) {
        throw new ForbiddenException('You cannot grant permissions beyond your own');
      }
    }
    if (data.billBy !== undefined && data.billBy !== null && !isBillBy(data.billBy)) {
      throw new BadRequestException('Bill by must be HOUR, DAY or BOTH');
    }
    if (data.billBy && member.user?.isExternal) {
      throw new BadRequestException('An external member is not billed by you');
    }
    if (data.hoursBasis !== undefined && data.hoursBasis !== null && !isHoursBasis(data.hoursBasis)) {
      throw new BadRequestException('Hours on the invoice must be COUNTED, CLOCKED or SHIFT');
    }
    if (data.hoursBasis && member.user?.isExternal) {
      throw new BadRequestException('An external member is not billed by you');
    }

    const updated = await this.prisma.spaceAssignment.update({
      where: { id: member.id },
      data: {
        ...(data.workRoleId !== undefined && { workRoleId: workRole?.id ?? null }),
        ...(data.managementRoleId !== undefined && { roleId: mgmtRole?.id ?? null }),
        ...(data.allowSecondRole !== undefined && { allowSecondRole }),
        ...(data.billBy !== undefined && { billBy: data.billBy }),
        // COUNTED is the default: store it as null so "never chosen" and "counted" stay one answer.
        ...(data.hoursBasis !== undefined && { hoursBasis: data.hoursBasis === 'COUNTED' ? null : data.hoursBasis }),
      },
      include: { user: userSelect, role: roleSelect, workRole: roleSelect },
    });
    // A trade somebody holds here is a role this workspace uses.
    if (data.workRoleId && workRole) await this.useWorkRoleIn(this.prisma, data.spaceId, workRole.id);
    if (data.managementRoleId !== undefined) await this.dropStalePersonalRole(updated.id, updated.roleId ?? null);
    return success(
      {
        id: updated.id,
        userId: updated.userId,
        user: updated.user,
        spaceRole: updated.role,
        workRole: updated.workRole,
        allowSecondRole: updated.allowSecondRole,
        billBy: updated.billBy,
        effectiveBillBy: effectiveBillBy(updated.billBy as BillByValue | null),
        hoursBasis: updated.hoursBasis,
        effectiveHoursBasis: effectiveHoursBasis(updated.hoursBasis),
      },
      'Member updated',
    );
  }

  async removeMember(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    /** Set only for a caller acting through a grant in THIS workspace (see assignMember). */
    outrankPerms?: PermissionSet | null;
  }) {
    const member = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
      include: { role: { select: { permissions: true } } },
    });
    if (!member) throw new NotFoundException('Space member not found');
    // Taking somebody off a workspace who holds more there than you is not yours to do.
    if (data.outrankPerms && member.role && permissionsExceed(data.outrankPerms, permissionsFromOrgRole(member.role.permissions))) {
      throw new ForbiddenException({ message: 'This person holds more in this workspace than you do', code: 'MEMBER_ABOVE_YOU' });
    }
    await this.prisma.spaceAssignment.delete({ where: { id: member.id } });
    return success({ id: member.id }, 'Member removed');
  }

  // ── Per-person permissions (the builder) ────────────────────────────────────

  /** What one person may do here, as the builder shows it (shared `readAssignmentPermissions`). */
  async getMemberPermissions(data: {
    organizationId: string;
    spaceId: string;
    assignmentId: string;
    /** The caller's ceiling here, for the roles they may pick; null = admin. */
    requesterPerms?: PermissionSet | null;
  }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);
    const view = await readAssignmentPermissions(this.prisma as any, {
      organizationId: data.organizationId,
      assignmentId: data.assignmentId,
      spaceId: data.spaceId,
      ceiling: data.requesterPerms ?? null,
    }).catch(toHttp);
    return success(view);
  }

  /**
   * Save what one person may do here: a shared role, or a set of keys that
   * becomes their personal role (or the shared role it exactly matches).
   * Every rule is the shared writer's (`setAssignmentPermissions`) — the
   * invitation accept path runs the same one.
   */
  async setMemberPermissions(data: {
    organizationId: string;
    spaceId: string;
    assignmentId: string;
    choice: AssignmentPermissionsChoice;
    requesterPerms?: PermissionSet | null;
    requesterId?: string;
    outrankCheck?: boolean;
  }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);
    const ceiling = data.requesterPerms ?? null;
    await this.prisma.$transaction((tx) =>
      setAssignmentPermissions(tx as any, {
        organizationId: data.organizationId,
        spaceId: data.spaceId,
        assignmentId: data.assignmentId,
        choice: data.choice,
        ceiling,
        actorId: data.requesterId ?? null,
        outrankCheck: data.outrankCheck !== false,
      }),
    ).catch(toHttp);
    // Answer with what is now true, read back — the screen re-renders from it.
    return this.getMemberPermissions({ ...data, requesterPerms: ceiling });
  }
}
