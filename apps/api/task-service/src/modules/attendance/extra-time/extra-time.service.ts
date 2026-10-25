import { standInGrant } from '../../approvals/stand-in';
import { EXTRA_TIME_ANSWER_WAIT_MIN, moreTimeRefusal, personName, zoneOf } from '@hbcfield/shared';
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, SERVICE_NAMES, success, TimeEntryStatus } from '@hbcfield/shared';
import { endOfLocalDay } from '@hbcfield/shared';
import { ExtraTimeDecision, decidableExtraTimeWhere, respondedAt } from './extra-time-helpers';
import { AttendanceRoutingService } from '../core/attendance-routing.service';
import { type OwnRequestAsk } from '../../approvals/own-request-route';
import { askAboutExtraTime } from './extra-time-ask';
import { ExtraTimeApprovalService } from './extra-time-approval.service';
import { emitEvent, attendanceOvertimeRequestEvent } from '@hbcfield/shared/microservices';

export { decidableExtraTimeWhere, respondedAt } from './extra-time-helpers';

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
    // Who is told about this member, at this workspace.
    private readonly routing: AttendanceRoutingService,
    // The ONE approval path — an automatic approval goes through it too.
    private readonly approval: ExtraTimeApprovalService,
  ) {}

  /**
   * Who is asked about this member's extra time: the shared own-request rule
   * (a leader's own → the administrators, the only administrator's own →
   * approved automatically) over the usual workspace routing.
   */
  async askFor(entry: { locationId: string; organizationId: string; userId: string }): Promise<OwnRequestAsk> {
    return askAboutExtraTime(this.prisma, this.routing, entry);
  }

  /** Leader approves N more minutes of work → extends the expected end + re-arms reminders. */
  async approveExtraTime(data: ExtraTimeDecision) {
    return this.approval.approveExtraTime(data);
  }

  /**
   * Worker responds "I'm working extra time". Pauses reminders and routes the
   * request to the space's overtime approvers. The entry stays open.
   */
  async requestExtraTime(data: {
    userId: string;
    entryId: string;
    organizationId: string;
    occurredAt?: string | null;
  }) {
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
    // Nothing to extend: no planned end, or only the daily-hours marker — all of the time counts already (B2).
    const refusal = moreTimeRefusal(entry);
    if (refusal) {
      throw new BadRequestException({
        code: refusal,
        message: 'There is no planned end to extend — all of this time counts already.',
      });
    }

    /*
      One record per ROUND — and ONE open round per shift (clock review B1).

      The state machine on the entry is what drives the reminder engine, but it
      holds only "where are we now" — it cannot say that this is the second time
      today, who approved the first ninety minutes, or that they signed for them.
      A row per cycle is what makes the loop auditable, and it is why the unique
      index on `timeEntryId` had to go. A second tap or an offline replay while a
      round waits used to open ANOTHER pending round; deciding acts on the newest
      only, so the older ones stayed pending for ever. The entry is CLAIMED
      (OVERTIME_PENDING) in the same transaction that creates the round; a request
      that finds it already claimed answers with the round that waits.
    */
    const asked = respondedAt(data.occurredAt, entry.clockInAt);
    const created = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.timeEntry.updateMany({
        where: { id: entry.id, reminderState: { not: 'OVERTIME_PENDING' } },
        // Its deciders are asked once more if nobody answers (B10) — the worker is not nudged meanwhile.
        data: {
          reminderState: 'OVERTIME_PENDING',
          nextRemindAt: new Date(Date.now() + EXTRA_TIME_ANSWER_WAIT_MIN * 60_000),
        },
      });
      if (!claimed.count) return null;
      const previous = await tx.overtimeRequest.findFirst({
        where: { timeEntryId: entry.id },
        orderBy: { cycle: 'desc' },
        select: { cycle: true },
      });
      const next = (previous?.cycle ?? 0) + 1;
      await tx.overtimeRequest.create({
        data: {
          timeEntryId: entry.id,
          cycle: next,
          technicianId: entry.userId,
          locationId: entry.locationId,
          organizationId: data.organizationId,
          status: 'PENDING_APPROVAL',
          // When they said it — sent later from a phone without signal, that is not now.
          technicianRespondedAt: asked,
          // Where the overtime begins: the shift end.
          overtimeStartAt: entry.expectedClockOutAt ?? asked,
        },
      });
      return next;
    });
    if (created === null) {
      const waiting = await this.prisma.overtimeRequest.findFirst({
        where: { timeEntryId: entry.id, status: 'PENDING_APPROVAL' },
        orderBy: { cycle: 'desc' },
        select: { cycle: true },
      });
      return success(
        { entryId: entry.id, status: 'OVERTIME_PENDING', cycle: waiting?.cycle ?? null, alreadyAsked: true },
        'Already asked — waiting for a decision',
      );
    }
    const cycle = created;

    const ask = await this.askFor({ ...entry, organizationId: data.organizationId });
    if (ask.route === 'AUTOMATIC') {
      // The only administrator: approved at once, for the rest of the workspace's day — the
      // real clock-out still caps the counted time.
      const from = entry.expectedClockOutAt ?? respondedAt(data.occurredAt, entry.clockInAt);
      const dayEnd = endOfLocalDay(from, zoneOf(entry.location?.timezone));
      const minutes = Math.max(1, Math.min(1440, Math.round((dayEnd.getTime() - from.getTime()) / 60_000)));
      await this.approval.decide(
        { approverId: entry.userId, entryId: entry.id, minutes, organizationId: data.organizationId },
        true,
      );
      return success(
        { entryId: entry.id, status: 'OVERTIME_APPROVED', cycle, automatic: true },
        'Extra time approved automatically',
      );
    }
    emitEvent(this.notificationClient, attendanceOvertimeRequestEvent, {
      entryId: entry.id,
      userId: entry.userId,
      userName: personName(entry.user),
      locationId: entry.locationId,
      locationName: entry.location?.name || 'a shift',
      leaderIds: ask.ids,
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
    const ask = await this.askFor(entry);
    if (ask.route === 'AUTOMATIC') {
      // The only administrator: exactly the time worked past the end, approved at once.
      const from = entry.expectedClockOutAt ?? clockOutAt;
      const minutes = Math.max(1, Math.min(1440, Math.ceil((clockOutAt.getTime() - from.getTime()) / 60_000)));
      await this.approval.decide(
        { approverId: entry.userId, entryId: entry.id, minutes, organizationId: entry.organizationId },
        true,
      );
      return;
    }
    emitEvent(this.notificationClient, attendanceOvertimeRequestEvent, {
      entryId: entry.id,
      userId: entry.userId,
      userName: personName(updated.user),
      locationId: entry.locationId,
      locationName: updated.location?.name || 'a shift',
      leaderIds: ask.ids,
      cycle,
      organizationId: entry.organizationId,
    });
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
        .filter((a) => (a.role?.permissions as { canApproveOvertime?: boolean } | null)?.canApproveOvertime === true)
        .map((a) => a.spaceId);
      // A stand-in decides where the leader they cover does — everywhere, or in those workspaces.
      const standIn = await standInGrant(this.prisma, data.userId, data.organizationId);
      if (!standIn.org.canApproveOvertime) {
        for (const [spaceId, keys] of Object.entries(standIn.perSpace))
          if (keys.canApproveOvertime) spaceIds.push(spaceId);
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
}
