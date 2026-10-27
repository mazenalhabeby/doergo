import { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';
import { standInGrant } from '../../approvals/stand-in';
import { grantHolds, managesPeopleOrIsAdmin } from '@hbcfield/shared';
import { Injectable, Inject, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@hbcfield/shared';
import { success, TimeEntryStatus, SHIFT_REMINDER_DEFAULTS, SERVICE_NAMES } from '@hbcfield/shared';
import { scopeWhere } from '@hbcfield/shared';
import { assertNotSelfDecision } from '../core/self-decision';
import { CountedTimeService } from '../core/counted-time.service';
import { ExtraTimeDecision, decidableExtraTimeWhere, overtimeEndFor } from './extra-time-helpers';
import { relabelAfterEndMoved } from './label-end-moved';
import { emitEvent, attendanceOvertimeDecisionEvent } from '@hbcfield/shared/microservices';
import { approvedOvertimeByEntry, overtimeRuleFacts } from './overtime-rule-facts';

/**
 * Approving extra time — the ONE decision path (office rules, self-decision,
 * stand-ins) and who may approve overtime. The member's request and the office's
 * other decisions (refuse, remove, add to a closed shift) all come through here.
 */
@Injectable()
export class ExtraTimeApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly countedTime: CountedTimeService,
    // Office rules (a threshold → a second approval). Global in the app; absent only in narrow unit tests.
    private readonly rules: ApprovalRulesService,
  ) {}

  /** Leader approves N more minutes of work → extends the expected end + re-arms reminders. */
  async approveExtraTime(data: ExtraTimeDecision) {
    return this.decide(data, false);
  }

  /** `automatic`: the only administrator's own request, recorded as approved automatically — never reachable from a request body. */
  async decide(data: ExtraTimeDecision, automatic: boolean) {
    let minutes = Math.round(data.minutes);
    if (!minutes || minutes < 1 || minutes > 1440) {
      throw new BadRequestException('Approved minutes must be between 1 and 1440');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      // Scoped as well as checked below: `userCanApproveOvertime` already tests
      // this entry's own space, and the two agreeing is the point — the guard
      // now admits a space-scoped caller, so nothing here may assume org-wide.
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
        ...scopeWhere(data.scopeSpaceIds),
        ...decidableExtraTimeWhere(new Date()),
      },
      include: { shift: { select: { graceMin: true } } },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');
    /*
      ⚠️ The shift may already be CLOSED. A member who asked for extra time and
      then clocked out with no signal sends both later, in that order; by the
      time a leader looks, the clock-out is in. Refusing then would leave the
      overtime they actually worked unpaid, with nothing on screen to say why.
    */
    const closed = entry.status === TimeEntryStatus.CLOCKED_OUT;

    const allowed = await this.userCanApproveOvertime(data.approverId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');
    await this.assertNotSelfOvertimeDecision(data.approverId, entry.userId, data.organizationId);

    const now = new Date();
    const graceMin = entry.shift?.graceMin ?? SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;

    /*
      The decision, written where it can be produced later.

      A signature is optional but recorded exactly as given: it is bound to the
      round and to the approver's own user id, server-side. A name arriving in a
      request body is decoration — the authority is the token the call was made
      with, which is what `userCanApproveOvertime` above just checked.
    */
    const round = await this.prisma.overtimeRequest.findFirst({
      where: { timeEntryId: entry.id, status: 'PENDING_APPROVAL' },
      orderBy: { cycle: 'desc' },
      select: { id: true, overtimeStartAt: true, createdAt: true },
    });
    // Approvals half-way for an EARLIER round of this shift (one that expired or was declined) are not this one's.
    if (round) await this.rules.clearBefore(data.organizationId, 'overtime', entry.id, round.createdAt);

    // Office rules: past a threshold this approval is one of several, and the shift waits for the others.
    const decided = await this.rules.decide(
      {
        organizationId: data.organizationId,
        kind: 'overtime',
        itemId: entry.id,
        // Judged on the shift's whole overtime; this decision agrees to its own minutes.
        facts: overtimeRuleFacts(entry.locationId, minutes, await this.approvedOvertimeMinutes(entry.id)),
        agreeMinutes: minutes,
        deciderId: data.approverId,
        subjectId: entry.userId,
      },
      async (agreed) => {
        if (agreed != null) minutes = agreed;
        /*
          ⚠️ APPROVED OVERTIME IS A NUMBER OF MINUTES AFTER THE END, NOT AFTER THE CLICK.

          This used to extend from "now" when the shift had already ended, which
          made the pay depend on when the leader happened to look: ninety minutes
          approved at 19:00 for a shift that ended at 17:00 paid until 20:30. With a
          phone that sends its clock-out hours later, that is money nobody approved.
          So the minutes run from the end the member was working to — the current
          expected end (moved by earlier rounds, so rounds add up), or where the
          request said overtime began — and the paid time is still capped by the
          real clock-out. Only the REMINDER waits for now: a member whose approved
          time has already run out is asked again after the grace, not in the past.
        */
        const newExpected = overtimeEndFor({
          expectedEndAt: entry.expectedClockOutAt,
          requestStartedAt: round?.overtimeStartAt ?? null,
          clockOutAt: entry.clockOutAt,
          now,
          minutes,
        });
        const remindFrom = newExpected.getTime() > now.getTime() ? newExpected : now;

        await this.prisma.$transaction([
          this.prisma.timeEntry.update({
            where: { id: entry.id },
            data: closed
              ? { expectedClockOutAt: newExpected }
              : {
                  expectedClockOutAt: newExpected,
                  reminderState: 'OVERTIME_APPROVED',
                  reminderCount: 0,
                  nextRemindAt: new Date(remindFrom.getTime() + graceMin * 60_000),
                },
          }),
          ...(round
            ? [
                this.prisma.overtimeRequest.update({
                  where: { id: round.id },
                  data: {
                    status: 'APPROVED',
                    approvedById: data.approverId,
                    approvedAt: now,
                    maxDurationMinutes: minutes,
                    overtimeEndAt: newExpected,
                    approvalMethod: automatic ? 'AUTOMATIC' : data.signature ? 'SIGNATURE' : 'REMOTE',
                    leaderSignature: data.signature ?? null,
                    approverNotes: data.notes ?? null,
                  },
                }),
              ]
            : []),
        ]);

        // Closed: the timesheet already counted it — count it again with the approval.
        if (closed) await this.countedTime.recomputeClosed({ ...entry, expectedClockOutAt: newExpected });
        await relabelAfterEndMoved(this.prisma, entry, newExpected); // new entries: facts + departure labels
        return newExpected;
      },
    );
    if (decided.waiting) {
      return success({ entryId: entry.id, ...decided.waiting }, `Approved — waiting for ${decided.waiting.waitingFor}`);
    }
    const newExpected = decided.done;

    // Approved automatically: the owner asked and is answered on screen, not pushed about their own.
    if (!automatic)
      emitEvent(this.notificationClient, attendanceOvertimeDecisionEvent, {
        entryId: entry.id,
        userId: entry.userId,
        decision: 'approved',
        minutes,
        newExpectedClockOutAt: newExpected.toISOString(),
        organizationId: data.organizationId,
      });

    return success(
      { entryId: entry.id, minutes, expectedClockOutAt: newExpected.toISOString() },
      `Approved ${minutes} min of overtime`,
    );
  }

  /**
   * Overtime is paid time, and the whole request/approve flow exists so a SECOND
   * party sanctions it. `userCanApproveOvertime` answers "may you approve here?"
   * and said nothing about whose shift it is, so a shift leader holding
   * `canApproveOvertime` could approve their own extra time — and the pending list
   * offered it to them (audit AT-B1).
   *
   * A true org ADMIN is exempt: they are the owner, there is nobody above them to
   * approve it, and in a one-person organization blocking this would leave the
   * shift impossible to extend at all. Everyone with DELEGATED authority — a space
   * role grant, or `canManageUsers` — needs someone else.
   */
  async assertNotSelfOvertimeDecision(approverId: string, subjectId: string, organizationId: string): Promise<void> {
    // The rule itself lives in self-decision.ts, shared with every other flow
    // that decides somebody's item (entries, corrections, leave, expenses).
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: approverId,
      subjectId,
      organizationId,
      message: 'You cannot approve your own overtime. Ask a manager or an administrator.',
    });
  }

  /** Overtime already approved on this shift, every earlier round — what a rule adds this round to. */
  async approvedOvertimeMinutes(entryId: string): Promise<number> {
    return (await approvedOvertimeByEntry(this.prisma, [entryId])).get(entryId) ?? 0;
  }

  /** True if the user may approve overtime for a space (space sub-role grant, or org admin). */
  async userCanApproveOvertime(userId: string, spaceId: string, organizationId: string): Promise<boolean> {
    // Unified space assignment grant — spaceId is the resource's own, never
    // client-supplied, so this only grants where the user is truly assigned.
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: { userId, spaceId, organizationId, role: { isActive: true } },
      include: { role: { select: { permissions: true } } },
    });
    if ((assignment?.role?.permissions as { canApproveOvertime?: boolean } | null)?.canApproveOvertime === true)
      return true;
    // Standing in for a leader who approves overtime here (or everywhere) today.
    if (grantHolds(await standInGrant(this.prisma, userId, organizationId), 'canApproveOvertime', spaceId)) return true;
    // Org admins / user managers can always approve.
    const admin = await managesPeopleOrIsAdmin(this.prisma, userId, organizationId);
    return !!admin;
  }
}
