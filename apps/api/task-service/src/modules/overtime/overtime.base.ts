import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@hbcfield/shared';
import { AttendanceService } from '../attendance/attendance.service';
import {
  SERVICE_NAMES,
  QUEUE_NAMES,
  OVERTIME_CONSTANTS,
  scopeWhere,
  type SpaceScopeIds,
  OVERTIME_NOTICE_EVENT,
  type OvertimeNotice,
} from '@hbcfield/shared';
import { DecidedCloseService } from './../attendance/decided-close.service';
import { refusalNudge } from '../attendance/extra-time-helpers';

/**
 * What the overtime services share: telling people, finding a pending approval the
 * leader may decide, approving it, and ending the shift through attendance's one
 * close.
 */
@Injectable()
export abstract class OvertimeBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    protected readonly notificationClient: ClientProxy,
    @InjectQueue(QUEUE_NAMES.OVERTIME)
    protected readonly overtimeQueue: Queue,
    protected readonly attendance: AttendanceService,
    // ⚠️ Ending the shift is attendance's ONE close (DecidedCloseService.closeByDecision):
    // counted time, rests, excursions, reminders, jobs and the event, never a
    // hand-written status flip. Needs DecidedCloseService in AttendanceModule's exports.
    protected readonly decidedClose: DecidedCloseService,
  ) {}

  /**
   * Every push this flow sends, as a catalogue reference (shared
   * attendance/overtime-notice.ts). Never a sentence: the notification service
   * writes it in each reader's language. Nobody to tell → nothing emitted.
   */
  protected notify(notice: Omit<OvertimeNotice, 'recipientIds'> & { recipientIds: string[] }): void {
    if (notice.recipientIds.length === 0) return;
    this.notificationClient.emit(OVERTIME_NOTICE_EVENT, notice satisfies OvertimeNotice);
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  protected async findPendingApproval(requestId: string, organizationId: string, scope?: SpaceScopeIds) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id: requestId,
        organizationId,
        status: 'PENDING_APPROVAL',
        // Only the caller's granted spaces. One loader serves approve and
        // reject, so the check cannot be present on one and missing from the
        // other — a request outside their spaces reads as 'not found'.
        ...scopeWhere(scope),
      },
    });
    if (!request) {
      throw new NotFoundException('Overtime request not found or not pending approval');
    }
    return request;
  }

  /*
    ⚠️ APPROVING IS ONE RULE, AND IT LIVES IN ATTENDANCE.

    This used to mark the round APPROVED from the click, schedule a job that
    clocked the member out when the minutes ran out, and never touch the shift.
    Counted time stops at `expectedClockOutAt`, so an approval from the web
    Overtime page or a signature read "Approved" and counted nothing — and on a
    shift sent in the next day from a phone without signal, the job had nobody
    to clock out and recorded minutes since the click. The phone's extra-time
    screen already did it right: minutes from the shift end, the expected end
    moved, a closed shift recounted. Every approval goes through that now.
  */
  protected async approveRequest(
    request: { id: string; timeEntryId: string; organizationId: string },
    approval: {
      approverId: string;
      maxDurationMinutes: number;
      notes?: string;
      method: 'REMOTE' | 'SIGNATURE';
      leaderName?: string;
      leaderSignature?: string;
    },
  ) {
    const minutes = Math.min(approval.maxDurationMinutes, OVERTIME_CONSTANTS.MAX_OVERTIME_DURATION_MINUTES);
    const result = await this.attendance.approveExtraTime({
      approverId: approval.approverId,
      entryId: request.timeEntryId,
      minutes,
      organizationId: request.organizationId,
      signature: approval.method === 'SIGNATURE' ? (approval.leaderSignature ?? null) : null,
      notes: approval.notes ?? null,
    });
    if (approval.leaderName) {
      await this.prisma.overtimeRequest.update({
        where: { id: request.id },
        data: { leaderName: approval.leaderName },
      });
    }

    this.logger.log(`Overtime ${request.id} approved: ${minutes} min by ${approval.approverId} via ${approval.method}`);
    return result;
  }

  /**
   * More time refused (a leader's no, or nobody confirming in time): the member stays
   * clocked in and is nudged to clock out now — what counts already stops at the
   * planned end. Never a clock-out (decided 2026-10-18).
   */
  protected async afterRefusal(timeEntryId: string, now: Date = new Date()): Promise<void> {
    await this.prisma.timeEntry.updateMany(refusalNudge(timeEntryId, now));
  }

  /**
   * The legacy flow's "this ends the shift" — through attendance's one close,
   * which ends a running rest, counts only up to the planned end, expires open
   * excursions, clears reminders, pauses jobs and announces the clock-out.
   * Quiet when the shift is already closed.
   */
  protected async endShift(
    timeEntryId: string,
    organizationId: string,
    note: string,
    reason: 'CLOCK_OUT' | 'OFFICE_CLOSE' | 'AUTO_CLOSE',
    at?: Date,
  ): Promise<void> {
    await this.decidedClose.closeByDecision({ entryId: timeEntryId, organizationId, note, reason, at });
  }
}
