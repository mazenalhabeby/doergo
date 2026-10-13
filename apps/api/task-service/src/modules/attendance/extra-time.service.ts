import { ApprovalRulesService } from '../../common/approval-rules/approval-rules.service';
import { Optional } from '@nestjs/common';
import { standInGrant } from '../../common/stand-in';
import { grantHolds } from '@hbcfield/shared';
import type { Prisma } from '@prisma/client';
import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, TimeEntryStatus, SHIFT_REMINDER_DEFAULTS, SERVICE_NAMES } from '@hbcfield/shared';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { assertNotSelfDecision } from './self-decision';
import { CountedTimeService } from './counted-time.service';
import { AttendanceRoutingService } from './attendance-routing.service';

/** How long after its clock-out a shift's extra time may still be decided. */
const EXTRA_TIME_DECIDABLE_AFTER_CLOSE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Extra time on a shift: a member asking for it (during the shift or at the
 * clock-out), a leader approving, rejecting or removing it, and a manager
 * adding it to a closed shift.
 */
@Injectable()
export class ExtraTimeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly countedTime: CountedTimeService,
    // Who is told about this member, at this workspace.
    private readonly routing: AttendanceRoutingService,
    // Office rules (a threshold → a second approval). Global in the app; absent only in narrow unit tests.
    @Optional() private readonly rules?: ApprovalRulesService,
  ) {}

  /**
   * Worker responds "I'm working extra time". Pauses reminders and routes the
   * request to the space's overtime approvers. The entry stays open.
   */
  async requestExtraTime(data: { userId: string; entryId: string; organizationId: string; occurredAt?: string | null }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        location: { select: { id: true, name: true, timezone: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');

    /*
      One record per ROUND.

      The state machine on the entry is what drives the reminder engine, but it
      holds only "where are we now" — it cannot say that this is the second time
      today, who approved the first ninety minutes, or that they signed for them.
      A row per cycle is what makes the loop auditable, and it is why the unique
      index on `timeEntryId` had to go.
    */
    const previous = await this.prisma.overtimeRequest.findFirst({
      where: { timeEntryId: entry.id },
      orderBy: { cycle: 'desc' },
      select: { cycle: true },
    });
    const cycle = (previous?.cycle ?? 0) + 1;

    await this.prisma.$transaction([
      this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: { reminderState: 'OVERTIME_PENDING', nextRemindAt: null },
      }),
      this.prisma.overtimeRequest.create({
        data: {
          timeEntryId: entry.id,
          cycle,
          technicianId: entry.userId,
          locationId: entry.locationId,
          organizationId: data.organizationId,
          status: 'PENDING_APPROVAL',
          // When they said it — sent later from a phone without signal, that is not now.
          technicianRespondedAt: respondedAt(data.occurredAt, entry.clockInAt),
          // Where the overtime begins: the shift end, or — with no planned end — when they asked.
          overtimeStartAt: entry.expectedClockOutAt ?? respondedAt(data.occurredAt, entry.clockInAt),
        },
      }),
    ]);

    const leaderIds = await this.routing.notifyTargetsFor(
      { ...entry, organizationId: data.organizationId },
      'canApproveOvertime',
    );
    this.notificationClient.emit('attendance_overtime_request', {
      entryId: entry.id,
      userId: entry.userId,
      userName: `${entry.user.firstName} ${entry.user.lastName}`,
      locationId: entry.locationId,
      locationName: entry.location?.name || 'a shift',
      leaderIds,
      cycle,
      organizationId: data.organizationId,
    });

    return success({ entryId: entry.id, status: 'OVERTIME_PENDING', cycle }, 'Extra-time request sent for approval');
  }

  /**
   * A late clock-out with a reason becomes an overtime request for a leader.
   *
   * Only when nothing is already waiting (a request made during the shift wins)
   * and the shift really ran past its end. The round is the same record a
   * request during the shift makes, so the leader decides it the same way —
   * the closed-shift decision path pays nothing past the approval.
   */
  async requestOvertimeAtClockOut(
    entry: { id: string; userId: string; locationId: string; organizationId: string; expectedClockOutAt: Date | null },
    updated: { user?: { firstName: string; lastName: string } | null; location?: { name?: string | null } | null },
    clockOutAt: Date,
    reason: string,
  ) {
    const rounds = await this.prisma.overtimeRequest.findMany({
      where: { timeEntryId: entry.id },
      orderBy: { cycle: 'desc' },
      select: { cycle: true, status: true },
    });
    if (rounds.some((r) => r.status === 'PENDING_APPROVAL')) return;
    const cycle = (rounds[0]?.cycle ?? 0) + 1;
    await this.prisma.overtimeRequest.create({
      data: {
        timeEntryId: entry.id,
        cycle,
        technicianId: entry.userId,
        locationId: entry.locationId,
        organizationId: entry.organizationId,
        status: 'PENDING_APPROVAL',
        technicianRespondedAt: clockOutAt,
        technicianReason: reason,
        overtimeStartAt: entry.expectedClockOutAt ?? clockOutAt,
        actualEndAt: clockOutAt,
      },
    });
    const leaderIds = await this.routing.notifyTargetsFor(entry, 'canApproveOvertime');
    this.notificationClient.emit('attendance_overtime_request', {
      entryId: entry.id,
      userId: entry.userId,
      userName: `${updated.user?.firstName ?? ''} ${updated.user?.lastName ?? ''}`.trim(),
      locationId: entry.locationId,
      locationName: updated.location?.name || 'a shift',
      leaderIds,
      cycle,
      organizationId: entry.organizationId,
    });
  }

  /** Leader approves N more minutes of work → extends the expected end + re-arms reminders. */
  async approveExtraTime(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    approverId: string;
    entryId: string;
    minutes: number;
    organizationId: string;
    /** base64 PNG, when the leader signed rather than tapping approve. */
    signature?: string | null;
    notes?: string | null;
  }) {
    let minutes = Math.round(data.minutes);
    if (!minutes || minutes < 1 || minutes > 1440) {
      throw new BadRequestException('Approved minutes must be between 1 and 1440');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      // Scoped as well as checked below: `userCanApproveOvertime` already tests
      // this entry's own space, and the two agreeing is the point — the guard
      // now admits a space-scoped caller, so nothing here may assume org-wide.
      where: { id: data.entryId, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds), ...decidableExtraTimeWhere(new Date()) },
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
      select: { id: true, overtimeStartAt: true },
    });

    // Office rules: past a threshold this approval is step 1 of 2, and the shift waits for the second person.
    if (this.rules) {
      const verdict = await this.rules.gate({
        organizationId: data.organizationId,
        kind: 'overtime',
        itemId: entry.id,
        facts: { spaceIds: entry.locationId ? [entry.locationId] : [], minutes },
        deciderId: data.approverId,
        subjectId: entry.userId,
      });
      if (!verdict.finalize) {
        return success({ entryId: entry.id, stage: 'FIRST_STEP', waitingFor: verdict.roleName }, `Approved — waiting for ${verdict.roleName}`);
      }
      if (verdict.minutes != null) minutes = verdict.minutes;
    }

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
                approvalMethod: data.signature ? 'SIGNATURE' : 'REMOTE',
                leaderSignature: data.signature ?? null,
                approverNotes: data.notes ?? null,
              },
            }),
          ]
        : []),
    ]);

    // Closed: the timesheet already counted it — count it again with the approval.
    if (closed) await this.countedTime.recomputeClosed({ ...entry, expectedClockOutAt: newExpected });

    this.notificationClient.emit('attendance_overtime_decision', {
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
   * Remove an APPROVED overtime round as if it had never been approved.
   *
   * Approving moved the shift end later by the approved minutes and, on a
   * closed shift, recounted the day. This puts the end back where that round
   * found it (`overtimeStartAt`, else the end minus the minutes), recounts the
   * day, and deletes the round — so the timesheet, the margin and the next
   * invoice read the day as planned. Only the LATEST approved round of a shift
   * comes off (rounds add up; an earlier one sits under a later one). Same
   * permission as approving, and nobody removes their own. The request log
   * (audit) records who removed it.
   */
  async removeApprovedOvertime(data: { actorId: string; overtimeId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    const round = await this.prisma.overtimeRequest.findFirst({
      where: { id: data.overtimeId, organizationId: data.organizationId, status: { in: ['APPROVED', 'COMPLETED'] } },
    });
    if (!round) throw new NotFoundException('Approved overtime not found');
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: round.timeEntryId, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
    });
    if (!entry) throw new NotFoundException('Approved overtime not found');
    const allowed = await this.userCanApproveOvertime(data.actorId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');
    await this.assertNotSelfOvertimeDecision(data.actorId, entry.userId, data.organizationId);

    const later = await this.prisma.overtimeRequest.count({
      where: { timeEntryId: entry.id, status: { in: ['APPROVED', 'COMPLETED'] }, cycle: { gt: round.cycle } },
    });
    if (later > 0) {
      throw new BadRequestException({ message: 'A later approved overtime on this shift has to be removed first.', code: 'OVERTIME_LATER_ROUND' });
    }

    const minutes = round.maxDurationMinutes ?? 0;
    const back = round.overtimeStartAt
      ?? (entry.expectedClockOutAt ? new Date(entry.expectedClockOutAt.getTime() - minutes * 60_000) : null);
    await this.prisma.$transaction([
      this.prisma.timeEntry.update({ where: { id: entry.id }, data: { expectedClockOutAt: back } }),
      this.prisma.overtimeRequest.delete({ where: { id: round.id } }),
    ]);
    // A closed shift was counted with the approval — count it again without.
    if (entry.clockOutAt) await this.countedTime.recomputeClosed({ ...entry, expectedClockOutAt: back });

    return success(
      { entryId: entry.id, removedMinutes: minutes, expectedClockOutAt: back?.toISOString() ?? null },
      `Removed ${minutes} min of approved overtime`,
    );
  }

  /**
   * A manager adds overtime to a CLOSED shift nobody asked about.
   *
   * The member stayed late and never sent a request — they had no signal, or
   * never saw the prompt. Approving the entry does not count minutes past the
   * shift end, and editing its times does not move the end, so without this the
   * overtime could not be counted at all. Recorded as its own approved round
   * (approval method MANAGER, with the reason), under the same rules: minutes
   * after the shift end, capped by the real clock-out, not your own shift.
   * A request already waiting is simply approved instead.
   */
  async addOvertimeToClosedEntry(data: {
    approverId: string;
    entryId: string;
    minutes: number;
    reason?: string | null;
    organizationId: string;
    scopeSpaceIds?: AttendanceScope;
  }) {
    const minutes = Math.round(data.minutes);
    if (!minutes || minutes < 1 || minutes > 1440) {
      throw new BadRequestException('Overtime minutes must be between 1 and 1440');
    }
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_OUT, ...scopeWhere(data.scopeSpaceIds) },
      include: { overtimeRequests: { where: { status: 'PENDING_APPROVAL' }, select: { id: true }, take: 1 } },
    });
    if (!entry || !entry.clockOutAt) throw new NotFoundException('Time entry not found');
    if (entry.overtimeRequests.length) {
      return this.approveExtraTime({ approverId: data.approverId, entryId: entry.id, minutes, organizationId: data.organizationId, notes: data.reason ?? null, scopeSpaceIds: data.scopeSpaceIds });
    }

    const allowed = await this.userCanApproveOvertime(data.approverId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');
    await this.assertNotSelfOvertimeDecision(data.approverId, entry.userId, data.organizationId);

    const now = new Date();
    const newExpected = overtimeEndFor({ expectedEndAt: entry.expectedClockOutAt, requestStartedAt: null, clockOutAt: entry.clockOutAt, now, minutes });
    const previous = await this.prisma.overtimeRequest.findFirst({ where: { timeEntryId: entry.id }, orderBy: { cycle: 'desc' }, select: { cycle: true } });

    await this.prisma.$transaction([
      this.prisma.timeEntry.update({ where: { id: entry.id }, data: { expectedClockOutAt: newExpected } }),
      this.prisma.overtimeRequest.create({
        data: {
          timeEntryId: entry.id,
          cycle: (previous?.cycle ?? 0) + 1,
          technicianId: entry.userId,
          locationId: entry.locationId,
          organizationId: data.organizationId,
          status: 'APPROVED',
          approvalMethod: 'MANAGER',
          approvedById: data.approverId,
          approvedAt: now,
          approverNotes: data.reason?.trim().slice(0, 500) || null,
          maxDurationMinutes: minutes,
          overtimeStartAt: entry.expectedClockOutAt ?? entry.clockOutAt,
          overtimeEndAt: newExpected,
          actualEndAt: entry.clockOutAt,
        },
      }),
    ]);
    await this.countedTime.recomputeClosed({ ...entry, expectedClockOutAt: newExpected });

    this.notificationClient.emit('attendance_overtime_decision', {
      entryId: entry.id,
      userId: entry.userId,
      decision: 'approved',
      minutes,
      newExpectedClockOutAt: newExpected.toISOString(),
      organizationId: data.organizationId,
    });
    return success({ entryId: entry.id, minutes, expectedClockOutAt: newExpected.toISOString() }, `Added ${minutes} min of overtime`);
  }

  /** Leader rejects the extra-time request → nudge the worker to clock out now. */
  async rejectExtraTime(data: {
    approverId: string;
    entryId: string;
    organizationId: string;
    reason?: string | null;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId, ...decidableExtraTimeWhere(new Date()) },
      select: { id: true, locationId: true, userId: true, status: true },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');
    const closed = entry.status === TimeEntryStatus.CLOCKED_OUT;

    const allowed = await this.userCanApproveOvertime(data.approverId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');
    await this.assertNotSelfOvertimeDecision(data.approverId, entry.userId, data.organizationId);
    // A rejection ends any two-step under an office rule.
    await this.rules?.clear(data.organizationId, 'overtime', entry.id);

    const round = await this.prisma.overtimeRequest.findFirst({
      where: { timeEntryId: entry.id, status: 'PENDING_APPROVAL' },
      orderBy: { cycle: 'desc' },
      select: { id: true },
    });

    // Give the worker a fresh reminder cycle to clock out now — reset the count
    // so a previously-exhausted worker gets a clean nudge, not instant escalation.
    // The refusal is recorded too: "asked twice, refused once" is a fact about
    // the day, and a request that vanishes when the answer is no is not a record.
    await this.prisma.$transaction([
      // A closed shift has nobody to nudge; only the round records the answer.
      ...(closed
        ? []
        : [
            this.prisma.timeEntry.update({
              where: { id: entry.id },
              data: { reminderState: 'REMINDED', reminderCount: 0, nextRemindAt: new Date() },
            }),
          ]),
      ...(round
        ? [
            this.prisma.overtimeRequest.update({
              where: { id: round.id },
              data: {
                status: 'REJECTED',
                approvedById: data.approverId,
                rejectedAt: new Date(),
                rejectionReason: data.reason ?? null,
              },
            }),
          ]
        : []),
    ]);

    this.notificationClient.emit('attendance_overtime_decision', {
      entryId: entry.id,
      userId: entry.userId,
      decision: 'rejected',
      organizationId: data.organizationId,
    });

    return success({ entryId: entry.id, decision: 'rejected' }, 'Extra-time request rejected');
  }

  /** Open extra-time requests awaiting approval, scoped to spaces the caller can approve for. */
  async listPendingExtraTime(data: { userId: string; organizationId: string; isAdmin?: boolean }) {
    let spaceFilter: { locationId?: { in: string[] } } = {};
    if (!data.isAdmin) {
      const assignments = await this.prisma.spaceAssignment.findMany({
        where: { userId: data.userId, organizationId: data.organizationId, role: { isActive: true } },
        include: { role: { select: { permissions: true } } },
      });
      const spaceIds = assignments
        .filter((a) => (a.role?.permissions as any)?.canApproveOvertime === true)
        .map((a) => a.spaceId);
      // A stand-in decides where the leader they cover does — everywhere, or in those workspaces.
      const standIn = await standInGrant(this.prisma, data.userId, data.organizationId);
      if (!standIn.org.canApproveOvertime) {
        for (const [spaceId, keys] of Object.entries(standIn.perSpace)) if (keys.canApproveOvertime) spaceIds.push(spaceId);
        if (spaceIds.length === 0) return success([], 'No pending extra-time requests');
        spaceFilter = { locationId: { in: [...new Set(spaceIds)] } };
      }
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: data.organizationId,
        // Open and waiting — or already clocked out (a phone sent both late) with the round still undecided.
        ...decidableExtraTimeWhere(new Date(), { openMustBePending: true }),
        // Never offer a leader their OWN request (audit AT-B1). Without this the
        // approve button appeared on your own row and one click granted yourself
        // paid time. An org ADMIN is exempt in the guard below — they have nobody
        // above them, and a solo owner has to be able to extend their own shift —
        // but they should not be nudged into it by a list either.
        userId: { not: data.userId },
        ...spaceFilter,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        location: { select: { id: true, name: true, timezone: true } },
      },
      orderBy: { expectedClockOutAt: 'asc' },
    });
    return success(entries, `${entries.length} pending extra-time request(s)`);
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
  private async assertNotSelfOvertimeDecision(
    approverId: string,
    subjectId: string,
    organizationId: string,
  ): Promise<void> {
    // The rule itself lives in self-decision.ts, shared with every other flow
    // that decides somebody's item (entries, corrections, leave, expenses).
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: approverId,
      subjectId,
      organizationId,
      message: 'You cannot approve your own overtime. Ask a manager or an administrator.',
    });
  }

  /** True if the user may approve overtime for a space (space sub-role grant, or org admin). */
  private async userCanApproveOvertime(
    userId: string,
    spaceId: string,
    organizationId: string,
  ): Promise<boolean> {
    // Unified space assignment grant — spaceId is the resource's own, never
    // client-supplied, so this only grants where the user is truly assigned.
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: { userId, spaceId, organizationId, role: { isActive: true } },
      include: { role: { select: { permissions: true } } },
    });
    if ((assignment?.role?.permissions as any)?.canApproveOvertime === true) return true;
    // Standing in for a leader who approves overtime here (or everywhere) today.
    if (grantHolds(await standInGrant(this.prisma, userId, organizationId), 'canApproveOvertime', spaceId)) return true;
    // Org admins / user managers can always approve.
    const admin = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        isActive: true,
        OR: [{ role: 'ADMIN' }, { canManageUsers: true }],
      },
      select: { id: true },
    });
    return !!admin;
  }
}

/**
 * A shift whose extra-time request a leader may still decide: open and waiting,
 * or closed within a week with the round still undecided.
 */
export function decidableExtraTimeWhere(now: Date, opts: { openMustBePending?: boolean } = {}): Prisma.TimeEntryWhereInput {
  return {
    OR: [
      // Deciding an open shift is as it always was; LISTING one needs a request waiting.
      opts.openMustBePending
        ? { status: TimeEntryStatus.CLOCKED_IN, reminderState: 'OVERTIME_PENDING' as const }
        : { status: TimeEntryStatus.CLOCKED_IN },
      {
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutAt: { gte: new Date(now.getTime() - EXTRA_TIME_DECIDABLE_AFTER_CLOSE_MS) },
        overtimeRequests: { some: { status: 'PENDING_APPROVAL' as const } },
      },
    ],
  };
}

/** The moment a member asked for extra time: the tap, never in the future, never before the shift. */
export function respondedAt(occurredAt: string | null | undefined, clockInAt: Date, now: Date = new Date()): Date {
  const at = occurredAt ? new Date(occurredAt) : null;
  if (!at || Number.isNaN(at.getTime())) return now;
  if (at.getTime() > now.getTime()) return now;
  if (at.getTime() < clockInAt.getTime()) return clockInAt;
  return at;
}

/**
 * The end an approval of `minutes` moves a shift to: minutes after the end the
 * member was working to, never after the moment of approval. Pure and shared by
 * a leader's approval and a manager adding overtime to a closed shift.
 */
function overtimeEndFor(input: {
  expectedEndAt: Date | null;
  requestStartedAt: Date | null;
  clockOutAt: Date | null;
  now: Date;
  minutes: number;
}): Date {
  const base = input.expectedEndAt ?? input.requestStartedAt ?? input.clockOutAt ?? input.now;
  return new Date(base.getTime() + Math.round(input.minutes) * 60_000);
}
