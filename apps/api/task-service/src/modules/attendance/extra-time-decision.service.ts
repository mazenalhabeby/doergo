import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { success, TimeEntryStatus } from '@hbcfield/shared';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { decidableExtraTimeWhere, overtimeEndFor } from './extra-time-helpers';
import { ExtraTimeBase } from './extra-time.base';
import { relabelAfterEndMoved } from './label-end-moved';
import { emitEvent, attendanceOvertimeDecisionEvent } from '@hbcfield/shared/microservices';

/**
 * The office deciding extra time after the fact: refusing it, taking back approved
 * overtime, adding overtime to a closed shift.
 */
@Injectable()
export class ExtraTimeDecisionService extends ExtraTimeBase {
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
  async removeApprovedOvertime(data: {
    actorId: string;
    overtimeId: string;
    organizationId: string;
    scopeSpaceIds?: AttendanceScope;
  }) {
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
      throw new BadRequestException({
        message: 'A later approved overtime on this shift has to be removed first.',
        code: 'OVERTIME_LATER_ROUND',
      });
    }

    const minutes = round.maxDurationMinutes ?? 0;
    const back =
      round.overtimeStartAt ??
      (entry.expectedClockOutAt ? new Date(entry.expectedClockOutAt.getTime() - minutes * 60_000) : null);
    await this.prisma.$transaction([
      this.prisma.timeEntry.update({ where: { id: entry.id }, data: { expectedClockOutAt: back } }),
      this.prisma.overtimeRequest.delete({ where: { id: round.id } }),
    ]);
    // A closed shift was counted with the approval — count it again without.
    if (entry.clockOutAt) await this.countedTime.recomputeClosed({ ...entry, expectedClockOutAt: back });
    await relabelAfterEndMoved(this.prisma, entry, back);

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
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_OUT,
        ...scopeWhere(data.scopeSpaceIds),
      },
      include: { overtimeRequests: { where: { status: 'PENDING_APPROVAL' }, select: { id: true }, take: 1 } },
    });
    if (!entry || !entry.clockOutAt) throw new NotFoundException('Time entry not found');
    if (entry.overtimeRequests.length) {
      return this.approveExtraTime({
        approverId: data.approverId,
        entryId: entry.id,
        minutes,
        organizationId: data.organizationId,
        notes: data.reason ?? null,
        scopeSpaceIds: data.scopeSpaceIds,
      });
    }

    const allowed = await this.userCanApproveOvertime(data.approverId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');
    await this.assertNotSelfOvertimeDecision(data.approverId, entry.userId, data.organizationId);

    const now = new Date();
    const newExpected = overtimeEndFor({
      expectedEndAt: entry.expectedClockOutAt,
      requestStartedAt: null,
      clockOutAt: entry.clockOutAt,
      now,
      minutes,
    });
    const previous = await this.prisma.overtimeRequest.findFirst({
      where: { timeEntryId: entry.id },
      orderBy: { cycle: 'desc' },
      select: { cycle: true },
    });

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
    await relabelAfterEndMoved(this.prisma, entry, newExpected);

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
      `Added ${minutes} min of overtime`,
    );
  }

  /** Leader rejects the extra-time request → nudge the worker to clock out now. */
  async rejectExtraTime(data: { approverId: string; entryId: string; organizationId: string; reason?: string | null }) {
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

    emitEvent(this.notificationClient, attendanceOvertimeDecisionEvent, {
      entryId: entry.id,
      userId: entry.userId,
      decision: 'rejected',
      organizationId: data.organizationId,
    });

    return success({ entryId: entry.id, decision: 'rejected' }, 'Extra-time request rejected');
  }
}
