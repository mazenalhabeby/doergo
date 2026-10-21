import {
  usableLegalEntityId,
  COMPANY_UNKNOWN_MESSAGE,
  Role,
  normalizeEmail,
  SHARED_ROLE_WHERE,
} from '@hbcfield/shared';
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '@hbcfield/shared';
import { UpdateMemberProfileDto } from './dto';
import { MemberAccessChecksService } from './member-access-checks.service';
import {
  clearsMemberRole,
  contactFields,
  flatPermissionFields,
  MEMBER_PROFILE_RESULT_SELECT,
  modulesFor,
  nameFields,
  roleChangeFields,
  scheduleFields,
  touchesPrivilege,
} from './member-profile-fields';

type Dto = UpdateMemberProfileDto;
type Data = Prisma.UserUncheckedUpdateInput;

/** The office changing a member's profile: role, access, employment, rates, the account. */
@Injectable()
export class MemberProfileService {
  private readonly logger = new Logger(MemberProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessChecks: MemberAccessChecksService,
  ) {}

  async updateMemberProfile(
    memberId: string,
    organizationId: string,
    requesterId: string,
    dto: UpdateMemberProfileDto,
  ) {
    const body = dto as Dto;
    // Verify member exists and belongs to the organization
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Self-mutation guard — see touchesPrivilege for what counts and why.
    if (touchesPrivilege(body) && memberId === requesterId) {
      throw new BadRequestException('You cannot change your own role, permissions, or access profile');
    }

    // Block privilege escalation when role/permissions are being changed.
    // enabledModules is guarded too (M-B1): re-scoping an ADMIN's access profile is
    // a downgrade of a superior, which a non-admin must not be able to perform.
    if (body.role !== undefined || body.canManageUsers !== undefined || body.enabledModules !== undefined) {
      await this.accessChecks.assertCanGrantRoleAndPerms(requesterId, organizationId, member, dto);
    }

    const data: Data = {};
    const ctx = { member, memberId, organizationId, requesterId, dto: body, data };

    await this.writeEmail(ctx);

    // Profile fields
    nameFields(body, data);
    // The employer on their paperwork: one of THIS organization's active companies, or null.
    if (body.employerEntityId !== undefined) {
      const employer = await usableLegalEntityId(this.prisma, organizationId, body.employerEntityId);
      if (!employer.ok) throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: 'COMPANY_UNKNOWN' });
      data.employerEntityId = employer.id;
    }
    scheduleFields(body, data);
    // Per-user Access Profile (modules / spaceScope / platforms / canContact)
    if (body.enabledModules !== undefined) {
      /*
        An external member cannot hold `clock` or `time_off`.

        Not features but an employment: clocking in records hours WE owe payment
        for, and a vacation request asks US for leave. Stripped on SAVE rather
        than hidden in the editor — the access panel is identical for everybody
        by design, so the rule has to survive whatever the panel offers, and a
        checkbox nobody can see is not a rule.

        Reads the flag being written when the same call sets it, so marking
        somebody external and editing their access in one request cannot slip
        past by ordering.
      */
      // The Access Profile is a JSON column; what was sent is stored (less what an external member cannot hold).
      data.enabledModules = modulesFor(
        body.enabledModules,
        await this.willBeExternal(memberId, body),
      ) as Prisma.InputJsonValue;
    }
    contactFields(body, data);
    await this.writeExternalFlag(ctx);
    await this.writeMemberRole(ctx);

    // Role/permission fields — only if role is provided
    if (body.role !== undefined) {
      await this.assertRoleChangeAllowed(ctx, body.role);
      roleChangeFields({ ...body, role: body.role }, data);
    } else {
      flatPermissionFields(body, data);
    }

    await this.accessChecks.assertFlatPermsWithinCeiling(requesterId, organizationId, data);

    const updated = await this.prisma.user.update({
      where: { id: memberId },
      data,
      select: MEMBER_PROFILE_RESULT_SELECT,
    });

    return { success: true, data: updated };
  }

  /** The flag being written when the same call sets it, else the stored one. */
  private async willBeExternal(memberId: string, dto: Dto): Promise<boolean> {
    return dto.isExternal !== undefined ? dto.isExternal === true : await this.accessChecks.isExternalMember(memberId);
  }

  /**
   * Login email. Normalized, uniqueness-checked across ALL users (it is the
   * login identifier), and a no-op when unchanged so re-saving the dialog
   * never trips the uniqueness guard.
   */
  private async writeEmail({ member, memberId, organizationId, requesterId, dto, data }: PatchContext) {
    if (dto.email === undefined) return;
    const email = normalizeEmail(String(dto.email));
    if (!email) throw new BadRequestException('Email is required');
    if (email === member.email) return;
    // The new address receives the password reset link — see assertMayControlAccount.
    if (memberId !== requesterId) {
      await this.accessChecks.assertMayControlAccount(requesterId, memberId, organizationId, 'email');
    }
    const taken = await this.prisma.user.findFirst({
      where: { email, id: { not: memberId } },
      select: { id: true },
    });
    if (taken) throw new BadRequestException('That email is already in use');
    data.email = email;
    this.logger.warn(`[MEMBER] email changed ${member.email} → ${email} (member ${memberId}) by ${requesterId}`);
  }

  /*
    Who they work for.

    Flipping somebody to external is a REDUCTION in reach, so it is refused
    while an org role is still attached rather than silently stripping one —
    an admin who meant to demote and an admin who forgot the role look
    identical here, and quietly removing authority is the worse guess.
  */
  private async writeExternalFlag({ member, memberId, organizationId, requesterId, dto, data }: PatchContext) {
    if (dto.isExternal === undefined) return;
    const nextExternal = dto.isExternal === true;
    if (nextExternal && !member.isExternal) {
      // Marking somebody external shuts them out of the organization's own property.
      await this.accessChecks.assertMayControlAccount(requesterId, memberId, organizationId, 'external');
    }
    if (nextExternal && !clearsMemberRole(dto)) {
      const current = await this.prisma.user.findFirst({
        where: { id: memberId, organizationId },
        select: { memberRoleId: true },
      });
      if (current?.memberRoleId) {
        throw new BadRequestException("Remove this member's organization-wide role before marking them external");
      }
    }
    data.isExternal = nextExternal;
  }

  /**
   * Unified org-wide role (Phase 4). Validated against the org + ORG scope so a
   * member can never be pointed at another org's role or a space-only role.
   */
  private async writeMemberRole({ memberId, organizationId, requesterId, dto, data }: PatchContext) {
    if (dto.memberRoleId === undefined) return;
    const roleId = dto.memberRoleId as string | null;
    if (roleId === null || roleId === '') {
      data.memberRoleId = null;
      return;
    }
    /*
      An external member never holds an ORG role.

      Org roles apply in every space, present and future — which is the one
      thing an outsider must not have. Their authority comes from a space
      assignment and ends at that space's edge. Checked against the value
      being written when the request also flips the flag, so the two cannot
      be combined in a single call to slip past each other.
    */
    if (await this.willBeExternal(memberId, dto)) {
      throw new BadRequestException(
        'An external member cannot hold an organization-wide role — assign them a role in a space instead',
      );
    }
    const role = await this.prisma.accessRole.findFirst({
      // Never a personal role — those are SPACE-scoped anyway, said out loud so a scope change cannot open it.
      where: { id: roleId, organizationId, isActive: true, scope: { in: ['ORG', 'BOTH'] }, ...SHARED_ROLE_WHERE },
      select: { id: true },
    });
    if (!role) throw new BadRequestException('Invalid role');
    // Ceiling guard: a non-admin can't point a member at a role that grants
    // more than the requester holds (privilege escalation via memberRoleId).
    await this.accessChecks.assertCanAssignMemberRole(requesterId, organizationId, role.id);
    data.memberRoleId = role.id;
  }

  private async assertRoleChangeAllowed({ member, memberId, organizationId }: PatchContext, role: string) {
    /*
      The owner is an admin, always.

      Demoting them would leave the organization owned by somebody who cannot
      administer it — the same lockout as an emptied role, reached by a
      different door. Transfer ownership first, then demote.
    */
    if (role !== Role.ADMIN) {
      await this.accessChecks.assertNotOwner(organizationId, memberId, 'demoted');
    }

    /*
      The value has to BE a role.

      `Role` is ADMIN | EMPLOYEE | CUSTOMER — MANAGER was retired in July, when
      managing became the canViewAllTasks / canAssignTasks flags rather than a
      role of its own. Anything else fell straight through to Prisma, which
      rejected the enum, and an unrecognised database error is reported as a
      500: the caller was told the server broke when they had simply named a
      role that does not exist.
    */
    if (!Object.values(Role).includes(role as Role)) {
      throw new BadRequestException(`Unknown role "${role}". Valid roles are ${Object.values(Role).join(', ')}.`);
    }
    // Self-role change already blocked by the privilege self-mutation guard above.

    // If demoting from ADMIN, check there's at least one other active ADMIN
    if (member.role === Role.ADMIN && role !== Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: {
          organizationId,
          role: Role.ADMIN,
          isActive: true,
          id: { not: memberId },
        },
      });

      if (adminCount === 0) {
        throw new BadRequestException('Cannot demote the last admin. Promote another member to admin first.');
      }
    }
  }
}

interface PatchContext {
  member: User;
  memberId: string;
  organizationId: string;
  requesterId: string;
  dto: Dto;
  data: Data;
}
