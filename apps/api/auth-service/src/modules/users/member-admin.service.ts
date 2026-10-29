import { MemberOffboarding } from '../../common/member-offboarding/member-offboarding.service';
import { SessionEvents } from '../../common/session-events/session-events.service';
import { Role, memberWorkFootprint } from '@hbcfield/shared';
import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { RemoveMemberDto } from './dto';
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
        throw new BadRequestException('Cannot remove the last admin from the organization.');
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
    // task-service's tables through its published reader (shared data/member-work), in one snapshot with ours.
    const [
      tasksCreated,
      tasksAssigned,
      comments,
      attachments,
      taskEvents,
      serviceReports,
      reportDefs,
      reportSchedules,
      recurringTemplates,
      supportTickets,
      messages,
      timeEntries,
      overtime,
      custodyPeriods,
      assetsHeld,
      assetMoney,
      invoices,
    ] = await this.prisma.$transaction([
      ...memberWorkFootprint(this.prisma, memberId),
      this.prisma.invoice.count({ where: { createdById: memberId } }),
    ]);
    const hasHistory = [
      tasksCreated,
      tasksAssigned,
      comments,
      attachments,
      taskEvents,
      serviceReports,
      reportDefs,
      reportSchedules,
      recurringTemplates,
      invoices,
      supportTickets,
      messages,
      timeEntries,
      overtime,
      custodyPeriods,
      assetsHeld,
      assetMoney,
    ].some((n) => n > 0);

    /*
      Released FIRST, whichever way they go: open jobs, workspace assignments
      and the equipment they hold (closed through AssetCustodyService, so the
      period ends and the holder mirror goes with it). The hard delete used to
      skip this, so somebody with no other history kept a van "held by nobody"
      — and a refusal here leaves them exactly as they were.
    */
    await this.offboarding?.release(organizationId, memberId, requesterId);

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
    // FKs stay valid (task-service already released their work above — MemberOffboarding).
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

  /**
   * Admin resets a member's password, returning a temporary password
   */
  async adminResetMemberPassword(memberId: string, organizationId: string, requesterId: string) {
    // Can't reset own password via this method
    if (memberId === requesterId) {
      throw new BadRequestException('Use the change password feature to update your own password');
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
