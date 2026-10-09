import { MemberOffboarding } from '../../common/member-offboarding/member-offboarding.service';
import { SessionEvents } from '../../common/session-events/session-events.service';
import {
  usableLegalEntityId,
  COMPANY_UNKNOWN_MESSAGE,
  parseAssignedHome,
  Role,
  filterExternalModules,
  normalizeEmail,
} from '@hbcfield/shared';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateMemberProfileDto, RemoveMemberDto } from './dto';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_COST_FACTOR, generateRandomPassword } from './users-common';
import { MemberAccessChecksService } from './member-access-checks.service';

/**
 * Administering a member: their profile and access, ownership, the home screen
 * the office sets, a password reset, and removal.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class MemberAdminService {
  private readonly logger = new Logger(MemberAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessChecks: MemberAccessChecksService,
    // Optional: socket revocation is best effort, and unit tests that do not
    // exercise it need not wire it.
    @Optional() private readonly sessionEvents?: SessionEvents,
    @Optional() private readonly offboarding?: MemberOffboarding,
  ) {}

  /**
   * Hand the organization to somebody else.
   *
   * The only way an owner stops being the owner, which is what makes "the owner
   * cannot be removed" a rule rather than a trap.
   *
   * ONLY THE OWNER MAY DO THIS. Not any admin — otherwise the protection is
   * theatre: an admin who cannot delete the founder could simply take ownership
   * from them and then delete them. Ownership is the one thing in the product
   * that is not delegable by holding a permission.
   *
   * The new owner is made an ADMIN in the same transaction, because an owner who
   * cannot administer the organization is the lockout this whole feature exists
   * to prevent. The previous owner stays an admin — losing ownership is not a
   * demotion, and stripping their access as a side effect of a handover is the
   * kind of surprise that makes people avoid the button.
   */
  async transferOwnership(data: { organizationId: string; requesterId: string; newOwnerId: string }) {
    const refuse = (statusCode: number, message: string) => ({ success: false as const, statusCode, message });

    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { ownerId: true },
    });
    if (!org) return refuse(HttpStatus.NOT_FOUND, 'Organization not found');

    /*
      An organization with no owner recorded yet — possible only for one created
      before ownership existed and never backfilled — is claimable by an admin, so
      it cannot become permanently ownerless. Once owned, only the owner moves it.
    */
    if (org.ownerId && org.ownerId !== data.requesterId) {
      return refuse(HttpStatus.FORBIDDEN, 'Only the organization owner can transfer ownership.');
    }
    if (org.ownerId === data.newOwnerId) {
      return refuse(HttpStatus.BAD_REQUEST, 'That member already owns this organization.');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: data.newOwnerId, organizationId: data.organizationId, isActive: true },
      select: { id: true, role: true, firstName: true, lastName: true, isExternal: true },
    });
    // Scoped to the organization: an id from another tenant must read as "not a
    // member here", never as a transfer.
    if (!target) return refuse(HttpStatus.NOT_FOUND, 'That member is not part of this organization.');

    /*
      Never to somebody who works for a client or partner.

      This transfer PROMOTES its target to ADMIN, so handing it to an external
      member would make a client's supervisor an admin and the owner of the
      organization in one step — the whole tenant, from a row menu. There is no
      legitimate case for it, so it is refused outright rather than warned about.
    */
    if (target.isExternal) {
      return refuse(
        HttpStatus.BAD_REQUEST,
        'Ownership cannot be transferred to an external member — they work for another company.',
      );
    }

    /*
      The new owner must ALREADY be an admin.

      Ownership used to promote whoever received it, which meant one click on a
      row menu turned any member into an admin — a privilege escalation that
      nobody explicitly approved and that no audit line describes as one. Making
      somebody an admin and handing them the organization are two decisions, and
      an owner should have to take them one at a time.

      The role write below stays: an admin who is already an admin is unchanged
      by it, and it keeps the invariant true if the two ever drift.
    */
    if (target.role !== Role.ADMIN) {
      return refuse(
        HttpStatus.BAD_REQUEST,
        'Ownership can only be transferred to an admin. Make them an admin first, then transfer.',
      );
    }

    if (!org.ownerId) {
      const requester = await this.prisma.user.findFirst({
        where: { id: data.requesterId, organizationId: data.organizationId, role: Role.ADMIN, isActive: true },
        select: { id: true },
      });
      if (!requester) return refuse(HttpStatus.FORBIDDEN, 'Only an admin can claim an unowned organization.');
    }

    /*
      Both writes or neither. An owner recorded against somebody who is not an
      admin is exactly the broken state this guards against, and a half-applied
      transfer is how you get there.
    */
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: target.id }, data: { role: Role.ADMIN } }),
      this.prisma.organization.update({ where: { id: data.organizationId }, data: { ownerId: target.id } }),
    ]);

    this.logger.warn(
      `[OWNERSHIP] org ${data.organizationId} transferred to ${target.id} by ${data.requesterId}`,
    );

    return {
      success: true,
      data: { ownerId: target.id, ownerName: `${target.firstName} ${target.lastName}`.trim() },
      message: 'Ownership transferred',
    };
  }

  /**
   * Set up a member's phone home screen from the office (or clear it: null).
   *
   * The phone applies each assignment once and then leaves the member free to
   * change it. Validated here against the shared definition, scoped to the
   * caller's organization, and never for a portal customer (they have no app
   * home). Entitlement is still decided by the phone at render time, so an
   * assignment cannot show anybody something they may not open.
   */
  async setAssignedHome(data: { memberId: string; organizationId: string; layout: unknown }) {
    const member = await this.prisma.user.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, role: { not: 'CUSTOMER' as any } },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    let value: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    if (data.layout !== null && data.layout !== undefined) {
      try {
        value = parseAssignedHome(data.layout) as unknown as Prisma.InputJsonValue;
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
    }
    await this.prisma.user.update({ where: { id: member.id }, data: { assignedHome: value } });
    return { success: true, data: value === Prisma.DbNull ? null : value };
  }

  async removeMember(dto: RemoveMemberDto) {
    const { memberId, organizationId, requesterId } = dto;

    // Can't remove self
    if (memberId === requesterId) {
      throw new BadRequestException('You cannot remove yourself');
    }

    // Verify member exists and belongs to the organization
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    /*
      The owner cannot be removed.

      Before this, any admin could delete any other admin — the founder of the
      organization included, by whoever they had invited that morning. The
      last-admin check below was the only floor, and it only fires when a single
      admin is left; with two admins each could delete the other.

      Ownership has to move first. That is not an obstacle for its own sake: it
      forces the question "who owns this organization now?" to be answered
      deliberately, by the one person entitled to answer it, instead of being
      settled by whoever clicked first.
    */
    await this.accessChecks.assertNotOwner(organizationId, memberId, 'removed');

    // Privilege ceiling (audit M-B2). updateMemberProfile already refuses to let a
    // non-admin holding canManageUsers touch an ADMIN; removal is the same act with a
    // stronger effect and was not enforcing it, so a manager could delete every admin
    // but one. Same guard, reused — an empty dto means "no grant", leaving only the
    // targetIsAdmin branch to fire.
    await this.accessChecks.assertCanGrantRoleAndPerms(requesterId, organizationId, member, {});

    // Can't remove the last ADMIN
    if (member.role === Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: {
          organizationId,
          role: Role.ADMIN,
          isActive: true,
          id: { not: memberId },
        },
      });

      if (adminCount === 0) {
        throw new BadRequestException(
          'Cannot remove the last admin from the organization.',
        );
      }
    }

    // Hard-delete when the member has NO work history, so their email is freed
    // for re-invitation; otherwise soft-delete (detach + deactivate) so their
    // tasks/attendance/reports keep a valid author. (Product decision 2026-08-11.)
    // The probe spans real-work tables AND the Restrict-blocking author FKs, so a
    // "no history" result can be deleted without tripping a foreign key. Cascade/
    // SetNull relations (tokens, push, schedules, assignments, time entries, etc.)
    // clear automatically; the only ephemeral Restrict blocker is invitations this
    // user created, cleared explicitly below.
    const [
      tasksCreated, tasksAssigned, comments, attachments, taskEvents,
      serviceReports, reportDefs, reportSchedules, recurringTemplates,
      invoices, supportTickets, messages, timeEntries, overtime,
    ] = await this.prisma.$transaction([
      this.prisma.task.count({ where: { createdById: memberId } }),
      this.prisma.task.count({ where: { assignedToId: memberId } }),
      this.prisma.comment.count({ where: { userId: memberId } }),
      this.prisma.attachment.count({ where: { uploadedById: memberId } }),
      this.prisma.taskEvent.count({ where: { userId: memberId } }),
      this.prisma.serviceReport.count({ where: { completedById: memberId } }),
      this.prisma.reportDefinition.count({ where: { createdById: memberId } }),
      this.prisma.reportSchedule.count({ where: { createdById: memberId } }),
      this.prisma.recurringTaskTemplate.count({ where: { createdById: memberId } }),
      this.prisma.invoice.count({ where: { createdById: memberId } }),
      this.prisma.supportTicket.count({ where: { createdById: memberId } }),
      this.prisma.message.count({ where: { senderId: memberId } }),
      this.prisma.timeEntry.count({ where: { userId: memberId } }),
      this.prisma.overtimeRequest.count({ where: { technicianId: memberId } }),
    ]);
    const hasHistory = [
      tasksCreated, tasksAssigned, comments, attachments, taskEvents,
      serviceReports, reportDefs, reportSchedules, recurringTemplates,
      invoices, supportTickets, messages, timeEntries, overtime,
    ].some((n) => n > 0);

    if (!hasHistory) {
      try {
        await this.prisma.$transaction([
          // Invitations this user created (Restrict FK) — the one ephemeral blocker.
          this.prisma.invitation.deleteMany({ where: { createdById: memberId } }),
          this.prisma.user.delete({ where: { id: memberId } }),
        ]);
        return { success: true, message: 'Member removed successfully' };
      } catch (err) {
        // A residual reference we didn't probe still blocks the delete — never
        // fail the removal; fall through to the soft-delete path instead.
        this.logger.warn(
          `Hard delete of member ${memberId} blocked; falling back to soft-delete. ${
            err instanceof Error ? err.message : ''
          }`,
        );
      }
    }

    // Soft delete: detach from org + deactivate, keeping the row so historical
    // FKs stay valid. Their open jobs, workspace assignments and equipment are
    // released by task-service FIRST (it owns those tables) — see MemberOffboarding.
    await this.offboarding?.release(organizationId, memberId, requesterId);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: memberId },
        data: {
          organizationId: null,
          isActive: false,
          onboardingCompleted: false,
          // Removed means signed out now, not when their tokens expire.
          tokensValidAfter: new Date(),
        },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: memberId } }),
    ]);
    this.sessionEvents?.sessionsRevoked(memberId);

    return { success: true, message: 'Member removed successfully' };
  }

  async updateMemberProfile(
    memberId: string,
    organizationId: string,
    requesterId: string,
    dto: UpdateMemberProfileDto,
  ) {
    // Verify member exists and belongs to the organization
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Self-mutation guard: a member can never change their OWN role, permissions,
    // or assigned role via this admin endpoint (their own profile edits go through
    // updateOwnProfile). memberRoleId is included — it points at a permission-bearing
    // role, so a self { memberRoleId: adminRoleId } would be an escalation.
    // enabledModules is included for the SAME reason (audit M-B1): the Access
    // Profile's `spaceScope` is a server-enforced READ control — 'all' returns every
    // space in the org (task-service locations.service) — and `platforms`
    // decide what the member can reach. Leaving it out let a non-admin holding
    // canManageUsers PATCH their own id with { enabledModules: { spaceScope: 'all' } }
    // and widen their own visibility.
    const touchesPrivilege =
      dto.role !== undefined ||
      dto.canManageUsers !== undefined ||
      dto.canCreateTasks !== undefined ||
      dto.canViewAllTasks !== undefined ||
      dto.canAssignTasks !== undefined ||
      (dto as any).taskCreationScope !== undefined ||
      (dto as any).canViewReports !== undefined ||
      (dto as any).memberRoleId !== undefined ||
      (dto as any).enabledModules !== undefined;
    if (touchesPrivilege && memberId === requesterId) {
      throw new BadRequestException(
        'You cannot change your own role, permissions, or access profile',
      );
    }

    // Block privilege escalation when role/permissions are being changed.
    // enabledModules is guarded too (M-B1): re-scoping an ADMIN's access profile is
    // a downgrade of a superior, which a non-admin must not be able to perform.
    if (
      dto.role !== undefined ||
      dto.canManageUsers !== undefined ||
      (dto as any).enabledModules !== undefined
    ) {
      await this.accessChecks.assertCanGrantRoleAndPerms(requesterId, organizationId, member, dto);
    }

    const data: any = {};

    // Login email. Normalized, uniqueness-checked across ALL users (it is the
    // login identifier), and a no-op when unchanged so re-saving the dialog
    // never trips the uniqueness guard.
    if ((dto as any).email !== undefined) {
      const email = normalizeEmail(String((dto as any).email));
      if (!email) throw new BadRequestException('Email is required');
      if (email !== member.email) {
        // The new address receives the password reset link — see assertMayControlAccount.
        if (memberId !== requesterId) await this.accessChecks.assertMayControlAccount(requesterId, memberId, organizationId, 'email');
        const taken = await this.prisma.user.findFirst({
          where: { email, id: { not: memberId } },
          select: { id: true },
        });
        if (taken) throw new BadRequestException('That email is already in use');
        data.email = email;
        this.logger.warn(
          `[MEMBER] email changed ${member.email} → ${email} (member ${memberId}) by ${requesterId}`,
        );
      }
    }

    // Profile fields
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.position !== undefined) data.position = dto.position;
    // The employer on their paperwork: one of THIS organization's active companies, or null.
    if ((dto as any).employerEntityId !== undefined) {
      const employer = await usableLegalEntityId(this.prisma as any, organizationId, (dto as any).employerEntityId);
      if (!employer.ok) throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: 'COMPANY_UNKNOWN' });
      data.employerEntityId = employer.id;
    }
    /*
      A birthday is a DAY, and only a day.

      Parsed at NOON UTC rather than midnight. The column is `@db.Date`, but the
      value travels as an instant on the way in: "1990-03-01T00:00:00Z" lands on
      the 28th of February for anyone west of Greenwich, which is how a person's
      birthday shifts by a day depending on where the server happens to be.
      Midday has no such edge in any real timezone.
    */
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(`${dto.dateOfBirth}T12:00:00Z`) : null;
    }
    if (dto.scheduleType !== undefined) data.scheduleType = dto.scheduleType;
    if (dto.monthlyHourBudget !== undefined) data.monthlyHourBudget = dto.monthlyHourBudget;
    // Per-user Access Profile (modules / spaceScope / platforms / canContact)
    if ((dto as any).enabledModules !== undefined) {
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
      const willBeExternal =
        (dto as any).isExternal !== undefined
          ? (dto as any).isExternal === true
          : await this.accessChecks.isExternalMember(memberId);
      const modules = (dto as any).enabledModules;
      data.enabledModules =
        willBeExternal && modules && typeof modules === 'object' && !Array.isArray(modules)
          ? { ...modules, modules: filterExternalModules((modules as { modules?: unknown }).modules) }
          : willBeExternal
          ? filterExternalModules(modules)
          : modules;
    }
    // Contact directory + access control
    if ((dto as any).contactable !== undefined) data.contactable = (dto as any).contactable;
    if ((dto as any).contactScope !== undefined) data.contactScope = (dto as any).contactScope;
    if ((dto as any).contactAllowedIds !== undefined) data.contactAllowedIds = (dto as any).contactAllowedIds;
    if ((dto as any).canViewReports !== undefined) data.canViewReports = (dto as any).canViewReports;
    if ((dto as any).allowRemote !== undefined) data.allowRemote = (dto as any).allowRemote;
    /*
      Who they work for.

      Flipping somebody to external is a REDUCTION in reach, so it is refused
      while an org role is still attached rather than silently stripping one —
      an admin who meant to demote and an admin who forgot the role look
      identical here, and quietly removing authority is the worse guess.
    */
    if ((dto as any).isExternal !== undefined) {
      const nextExternal = (dto as any).isExternal === true;
      if (nextExternal && !member.isExternal) {
        // Marking somebody external shuts them out of the organization's own property.
        await this.accessChecks.assertMayControlAccount(requesterId, memberId, organizationId, 'external');
      }
      if (nextExternal) {
        const clearingRole =
          (dto as any).memberRoleId !== undefined &&
          ((dto as any).memberRoleId === null || (dto as any).memberRoleId === '');
        if (!clearingRole) {
          const current = await this.prisma.user.findFirst({
            where: { id: memberId, organizationId },
            select: { memberRoleId: true },
          });
          if (current?.memberRoleId) {
            throw new BadRequestException(
              'Remove this member\'s organization-wide role before marking them external',
            );
          }
        }
      }
      data.isExternal = nextExternal;
    }

    // Unified org-wide role (Phase 4). Validated against the org + ORG scope so a
    // member can never be pointed at another org's role or a space-only role.
    if ((dto as any).memberRoleId !== undefined) {
      const roleId = (dto as any).memberRoleId as string | null;
      if (roleId === null || roleId === '') {
        data.memberRoleId = null;
      } else {
        /*
          An external member never holds an ORG role.

          Org roles apply in every space, present and future — which is the one
          thing an outsider must not have. Their authority comes from a space
          assignment and ends at that space's edge. Checked against the value
          being written when the request also flips the flag, so the two cannot
          be combined in a single call to slip past each other.
        */
        const willBeExternal =
          (dto as any).isExternal !== undefined
            ? (dto as any).isExternal === true
            : await this.accessChecks.isExternalMember(memberId);
        if (willBeExternal) {
          throw new BadRequestException(
            'An external member cannot hold an organization-wide role — assign them a role in a space instead',
          );
        }
        const role = await this.prisma.accessRole.findFirst({
          where: { id: roleId, organizationId, isActive: true, scope: { in: ['ORG', 'BOTH'] } },
          select: { id: true },
        });
        if (!role) throw new BadRequestException('Invalid role');
        // Ceiling guard: a non-admin can't point a member at a role that grants
        // more than the requester holds (privilege escalation via memberRoleId).
        await this.accessChecks.assertCanAssignMemberRole(requesterId, organizationId, role.id);
        data.memberRoleId = role.id;
      }
    }

    // Role/permission fields — only if role is provided
    if (dto.role !== undefined) {
      /*
        The owner is an admin, always.

        Demoting them would leave the organization owned by somebody who cannot
        administer it — the same lockout as an emptied role, reached by a
        different door. Transfer ownership first, then demote.
      */
      if (dto.role !== Role.ADMIN) {
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
      if (!Object.values(Role).includes(dto.role as Role)) {
        throw new BadRequestException(
          `Unknown role "${dto.role}". Valid roles are ${Object.values(Role).join(', ')}.`,
        );
      }
      // Self-role change already blocked by the privilege self-mutation guard above.

      // If demoting from ADMIN, check there's at least one other active ADMIN
      if (member.role === Role.ADMIN && dto.role !== Role.ADMIN) {
        const adminCount = await this.prisma.user.count({
          where: {
            organizationId,
            role: Role.ADMIN,
            isActive: true,
            id: { not: memberId },
          },
        });

        if (adminCount === 0) {
          throw new BadRequestException(
            'Cannot demote the last admin. Promote another member to admin first.',
          );
        }
      }

      data.role = dto.role;

      // Set default platform based on role if not provided
      data.canCreateTasks = dto.canCreateTasks ?? (dto.role === Role.ADMIN);
      // Default taskCreationScope by role
      const defaultScope = dto.role === Role.ADMIN ? 'ORG' : 'SELF';
      data.taskCreationScope = dto.taskCreationScope ?? defaultScope;
      data.canViewAllTasks =
        dto.canViewAllTasks ??
        dto.role === Role.ADMIN;
      data.canAssignTasks =
        dto.canAssignTasks ??
        dto.role === Role.ADMIN;
      data.canManageUsers = dto.canManageUsers ?? (dto.role === Role.ADMIN);
    } else {
      // No role change — still allow updating individual permission/platform fields
      if (dto.canCreateTasks !== undefined) data.canCreateTasks = dto.canCreateTasks;
      if (dto.taskCreationScope !== undefined) data.taskCreationScope = dto.taskCreationScope;
      if (dto.canViewAllTasks !== undefined) data.canViewAllTasks = dto.canViewAllTasks;
      if (dto.canAssignTasks !== undefined) data.canAssignTasks = dto.canAssignTasks;
      if (dto.canManageUsers !== undefined) data.canManageUsers = dto.canManageUsers;
    }

    await this.accessChecks.assertFlatPermsWithinCeiling(requesterId, organizationId, data);

    const updated = await this.prisma.user.update({
      where: { id: memberId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        position: true,
        scheduleType: true,
        monthlyHourBudget: true,
        canCreateTasks: true,
        taskCreationScope: true,
        canViewAllTasks: true,
        canAssignTasks: true,
        canManageUsers: true,
        memberRoleId: true,
      },
    });

    return { success: true, data: updated };
  }

  /**
   * Admin resets a member's password, returning a temporary password
   */
  async adminResetMemberPassword(
    memberId: string,
    organizationId: string,
    requesterId: string,
  ) {
    // Can't reset own password via this method
    if (memberId === requesterId) {
      throw new BadRequestException(
        'Use the change password feature to update your own password',
      );
    }

    // Verify member exists and belongs to the organization
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    /*
      A reset that hands back a temporary password IS signing in as the member,
      so the requester must already be entitled to everything the member holds.

      It was gated on `canManageUsers` alone, so any manager could reset the
      owner's password, read the temporary one off the response and sign in as
      the owner. The rule (owner never; an admin only by an admin; nobody whose
      permissions reach past the requester's) lives in `mayTakeOverAccount`.
    */
    await this.accessChecks.assertMayControlAccount(requesterId, memberId, organizationId, 'reset');

    // Generate temporary password
    const temporaryPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST_FACTOR);

    // Update the hash AND revoke all of the member's sessions atomically — an
    // admin resets a compromised account to lock an attacker out, so any
    // existing refresh tokens must stop working immediately.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: memberId },
        // …and the access tokens already issued, which need no row to work.
        data: { passwordHash, tokensValidAfter: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: memberId } }),
    ]);
    this.sessionEvents?.sessionsRevoked(memberId);

    return { success: true, temporaryPassword };
  }
}
