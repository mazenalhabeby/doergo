import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, SERVICE_NAMES } from '@hbcfield/shared';
import { BreakType, ApprovalStatus } from '@prisma/client';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { CountedTimeService } from './counted-time.service';
import { breakTotals } from '@hbcfield/shared';
import { missedRestColumnsAfterOfficeRest } from './label-rests';
import { assertNotSelfDecision } from './self-decision';

/** The office correcting a member's rests: adding one afterwards, deleting one. */
@Injectable()
export class OfficeBreaksService {
  private readonly logger = new Logger(OfficeBreaksService.name);

  constructor(
    private readonly prisma: PrismaService,
    // A break changes breakMinutes, and paid time is computed from it.
    private readonly countedTime: CountedTimeService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * End current break
   */
  /**
   * Add a break to somebody else's shift.
   *
   * Breaks are self-service by design and stay that way — the member starts and
   * ends their own on their phone. This is the correction path for when that did
   * not happen: a phone that died, a break taken before the app was installed, a
   * shift reconstructed after the fact.
   *
   * Four things make it safe rather than just possible:
   *
   *   it is gated on canReconcileAttendance, the same grant that already lets
   *     somebody correct a time entry — not on being an admin, so it can be given
   *     to the person who actually does payroll and to nobody else
   *   the row records WHO added it and WHY, so a manually-entered break can never
   *     be mistaken for the member's own account of their day
   *   the window is validated against the shift and against every other break, in
   *     memory over rows already loaded — a break outside the shift or overlapping
   *     another one is not a correction, it is a mistake being recorded
   *   an approved entry returns to PENDING, because paid hours just changed and
   *     an approval that predates the change is not an approval of it
   */
  async addBreakForMember(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    timeEntryId: string;
    organizationId: string;
    editorId: string;
    type?: BreakType;
    startedAt: string | Date;
    endedAt: string | Date;
    reason: string;
  }) {
    const refuse = (statusCode: number, message: string) => ({ success: false as const, statusCode, message });

    const reason = (data.reason || '').trim();
    if (!reason) return refuse(HttpStatus.BAD_REQUEST, 'A reason is required when adding a break for someone else.');

    const start = new Date(data.startedAt);
    const end = new Date(data.endedAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return refuse(HttpStatus.BAD_REQUEST, 'Start and end must be valid times.');
    }
    if (end <= start) return refuse(HttpStatus.BAD_REQUEST, 'The break must end after it starts.');

    // Org-scoped: an id from another tenant reads as "not found", never as an edit.
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.timeEntryId, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
      include: { breaks: true },
    });
    if (!entry) return refuse(HttpStatus.NOT_FOUND, 'Time entry not found.');

    // ⚠️ A rest added to your OWN shift changes your own counted time — the
    // second-party rule, as for editing the entry (self-decision.ts).
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.editorId,
      subjectId: entry.userId,
      organizationId: data.organizationId,
      message: 'You cannot change the rests on your own time entry. Ask a manager or an administrator.',
    });

    if (start < entry.clockInAt) {
      return refuse(HttpStatus.BAD_REQUEST, 'The break starts before the shift does.');
    }
    // An open shift has no end to be inside of; a closed one does.
    if (entry.clockOutAt && end > entry.clockOutAt) {
      return refuse(HttpStatus.BAD_REQUEST, 'The break ends after the shift does.');
    }

    /*
      Overlap, checked in memory over the breaks already fetched with the entry.
      A shift has a handful of them, so this is cheaper than asking the database
      and — more importantly — it is the same set the totals are recomputed from,
      so the check and the arithmetic cannot disagree.
    */
    const clash = entry.breaks.find((b) => {
      const bStart = b.startedAt;
      const bEnd = b.endedAt ?? entry.clockOutAt ?? new Date();
      return start < bEnd && end > bStart;
    });
    if (clash) return refuse(HttpStatus.CONFLICT, 'That overlaps a break already recorded on this shift.');

    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

    const created = await this.prisma.$transaction(async (tx) => {
      const br = await tx.break.create({
        data: {
          timeEntryId: entry.id,
          type: data.type ?? BreakType.SHORT,
          startedAt: start,
          endedAt: end,
          durationMinutes,
          addedById: data.editorId,
          reason,
        },
      });

      /*
        Recomputed from the rows, never incremented. `breakMinutes` is the sum of
        the completed breaks, and a running total that is added to drifts the
        moment anything is edited or deleted — which is exactly what this feature
        makes possible.
      */
      // Paid and unpaid are tracked apart: the screen shows the total, the
      // counted-time rule subtracts only what does not count as work.
      const { breakMinutes: totalBreakMinutes, unpaidBreakMinutes } = breakTotals([...entry.breaks, br]);

      await tx.timeEntry.update({
        where: { id: entry.id },
        data: {
          breakMinutes: totalBreakMinutes,
          unpaidBreakMinutes,
          // Label rules (new entries): a rest that makes up the required one removes “Missed rest”.
          ...missedRestColumnsAfterOfficeRest(entry, [...entry.breaks, br]),
          // Paid hours changed, so an approval given before it no longer applies.
          ...(entry.approvalStatus === ApprovalStatus.APPROVED
            ? { approvalStatus: ApprovalStatus.PENDING, approvedById: null, approvedAt: null }
            : {}),
        },
      });

      // Paid time is computed FROM breakMinutes, so it has to move with it — in
      // the same transaction, or a crash between the two leaves an entry whose
      // hours and whose breaks disagree, and both look plausible alone. The row
      // is handed over with the total just computed, so this costs one UPDATE
      // and no extra read.
      await this.countedTime.recomputeClosed({ ...entry, breakMinutes: totalBreakMinutes, unpaidBreakMinutes }, tx);

      return br;
    });

    this.logger.warn(
      `[ATTENDANCE] break added to entry ${entry.id} (user ${entry.userId}) by ${data.editorId}: ${durationMinutes}m — ${reason}`,
    );

    return { success: true, data: created, message: 'Break added' };
  }

  /**
   * Remove a break from a shift.
   *
   * Needed the moment breaks can be added by hand: a mistyped one would
   * otherwise be permanent, and "delete and re-add" is how an edit is performed
   * without a second endpoint carrying the same validation.
   *
   * A member's OWN break can be removed too, not only a manually added one — a
   * phone that recorded a break twice is exactly the kind of thing this exists to
   * correct. It is deliberate rather than incidental: the audit interceptor
   * records who called this and when, which is the trail once the row is gone.
   *
   * Same grant as adding, and the same two consequences: the entry's break total
   * is recomputed from the rows that remain, and an approved entry returns to
   * PENDING because its paid hours just changed.
   */
  async deleteBreak(data: { breakId: string; organizationId: string; editorId: string; scopeSpaceIds?: AttendanceScope }) {
    const refuse = (statusCode: number, message: string) => ({ success: false as const, statusCode, message });

    // Org-scoped through the entry: a break id from another tenant reads as "not
    // found", never as a deletion.
    const br = await this.prisma.break.findFirst({
      where: { id: data.breakId, timeEntry: { organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) } },
      include: {
        timeEntry: {
          // The counting fields ride along on a row already being fetched:
          // removing a break changes the paid figure, and asking for the entry
          // again afterwards would be a second query for data we had.
          select: {
            id: true,
            userId: true,
            approvalStatus: true,
            clockInAt: true,
            clockOutAt: true,
            expectedClockInAt: true,
            expectedClockOutAt: true,
            shiftId: true,
          },
        },
      },
    });
    if (!br) return refuse(HttpStatus.NOT_FOUND, 'Break not found.');

    // ⚠️ Removing a rest from your OWN shift raises your own counted time.
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.editorId,
      subjectId: br.timeEntry.userId,
      organizationId: data.organizationId,
      message: 'You cannot change the rests on your own time entry. Ask a manager or an administrator.',
    });

    if (!br.endedAt) {
      // An open break is the member's current state, not a record of the past.
      // Ending it is a different action with a different endpoint.
      return refuse(HttpStatus.CONFLICT, 'That break is still running. End it first.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.break.delete({ where: { id: br.id } });

      // Recomputed from what is left, never decremented — the same reason the
      // add path recomputes: a running total drifts the moment anything changes.
      const remaining = await tx.break.findMany({
        where: { timeEntryId: br.timeEntryId, endedAt: { not: null } },
        select: { startedAt: true, endedAt: true, durationMinutes: true, isPaid: true },
      });
      const { breakMinutes: remainingMinutes, unpaidBreakMinutes: remainingUnpaid } = breakTotals(remaining);
      await tx.timeEntry.update({
        where: { id: br.timeEntryId },
        data: {
          breakMinutes: remainingMinutes,
          unpaidBreakMinutes: remainingUnpaid,
          ...(br.timeEntry.approvalStatus === ApprovalStatus.APPROVED
            ? { approvalStatus: ApprovalStatus.PENDING, approvedById: null, approvedAt: null }
            : {}),
        },
      });

      // Same reason as the add path.
      await this.countedTime.recomputeClosed(
        { ...br.timeEntry, id: br.timeEntryId, breakMinutes: remainingMinutes, unpaidBreakMinutes: remainingUnpaid },
        tx,
      );
    });

    this.logger.warn(
      `[ATTENDANCE] break ${br.id} removed from entry ${br.timeEntryId} by ${data.editorId} (${br.durationMinutes ?? 0}m)`,
    );

    return { success: true, data: { id: br.id }, message: 'Break removed' };
  }
}
