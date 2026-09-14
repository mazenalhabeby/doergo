import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  paginated,
  TimeEntryStatus,
  SERVICE_NAMES,
  buildDateRangeFilter,
  buildSingleDayFilter,
} from '@hbcfield/shared';
import { BreakType, ApprovalStatus } from '@prisma/client';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { CountedTimeService } from './counted-time.service';
import type { OccurrenceEvidence } from '@hbcfield/shared';
import { judgeOccurrence } from '../../common/occurrence.util';
import { SAME_TAP_MS } from './attendance-occurrence';
import { parseBreakPlan, outstandingBreaks, markTaken, nextBreakRemindAt as nextRestAt, snooze as snoozePlan } from '@hbcfield/shared';

@Injectable()
export class BreakService {
  private readonly logger = new Logger(BreakService.name);

  constructor(
    private readonly prisma: PrismaService,
    // A break changes breakMinutes, and paid time is computed from it.
    private readonly countedTime: CountedTimeService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Start a break during current shift
   */
  async startBreak(data: {
    userId: string;
    organizationId: string;
    type?: string;
    notes?: string;
    /**
     * The planned rest this satisfies, when the member answered a prompt.
     *
     * Optional on purpose: taking an unplanned break stays allowed. A plan says
     * when a rest is EXPECTED, never that no other rest may happen.
     */
    ruleId?: string;
    /** The break's id, made on the phone — a resend returns the same break. */
    id?: string;
    /** The shift it belongs to, named by a phone that clocked in offline. */
    entryId?: string;
    /** When the tap happened, for a break recorded offline. */
    evidence?: OccurrenceEvidence;
  }) {
    this.logger.log(`Start break: user=${data.userId}, type=${data.type || 'SHORT'}`);

    if (data.id) {
      const prior = await this.prisma.break.findUnique({ where: { id: data.id }, include: { timeEntry: { select: { userId: true } } } });
      if (prior) {
        if (prior.timeEntry.userId !== data.userId) throw new ConflictException({ message: 'This id is already in use', code: 'ID_IN_USE' });
        const { timeEntry: _owner, ...breakRecord } = prior;
        return success(breakRecord, 'Break started');
      }
    }

    // Find active clock-in entry
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        ...(data.entryId ? { id: data.entryId } : {}),
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        breaks: {
          where: { endedAt: null },
        },
      },
    });

    if (!entry) {
      throw new BadRequestException('You must be clocked in to take a break');
    }

    // Check if already on break
    if (entry.breaks && entry.breaks.length > 0) {
      throw new BadRequestException('You are already on a break. End your current break first.');
    }

    // The tap's own time; not before the shift began, nor before the last rest ended.
    const lastRest = data.evidence
      ? await this.prisma.break.findFirst({ where: { timeEntryId: entry.id, endedAt: { not: null } }, orderBy: { endedAt: 'desc' }, select: { endedAt: true } })
      : null;
    const occurrence = judgeOccurrence(data.evidence, lastRest?.endedAt ?? entry.clockInAt);

    /*
      Which planned rest is this, and does it come off the paid time?

      `isPaid` is COPIED from the plan rather than read back from the rule later:
      editing a rule next month must not silently re-price a shift that has
      already been worked and paid.
    */
    const plan = parseBreakPlan(entry.breakPlan);
    const planned =
      (data.ruleId && plan.find((i) => i.ruleId === data.ruleId)) ||
      // No id given: the member tapped "take my rest now", so satisfy the one
      // that is next. Guessing beats refusing — the alternative is a prompt they
      // cannot answer from the screen they are on.
      outstandingBreaks(plan)[0] ||
      null;

    const startedAt = occurrence.at;

    // Create break record
    const breakRecord = await this.prisma.break.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        timeEntryId: entry.id,
        type: (data.type as any) || 'SHORT',
        startedAt,
        notes: data.notes,
        ruleId: planned?.ruleId ?? null,
        isPaid: planned?.isPaid ?? false,
      },
    });

    if (planned) {
      /*
        The plan and its indexed deadline move together, in one statement.

        The next wake-up is when THIS rest is over, so the member gets the "back
        to work" nudge rather than being asked again about a rest they are
        currently taking.
      */
      const updated = markTaken(plan, planned.ruleId, breakRecord.id, startedAt);
      await this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          breakPlan: updated as never,
          nextBreakRemindAt: new Date(startedAt.getTime() + planned.durationMinutes * 60_000),
        },
      });
    }

    // Get user info for notification
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { firstName: true, lastName: true },
    });

    // Emit break started notification
    this.notificationClient.emit('break_started', {
      userId: data.userId,
      userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
      breakId: breakRecord.id,
      breakType: breakRecord.type,
      startedAt: breakRecord.startedAt.toISOString(),
      organizationId: data.organizationId,
    });

    this.logger.log(`Break started: break=${breakRecord.id}, entry=${entry.id}`);

    return success(breakRecord, 'Break started');
  }

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
      const closed = [...entry.breaks, br].filter((b) => b.endedAt);
      const totalBreakMinutes = closed.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);
      // Paid and unpaid are tracked apart: the screen shows the total, the
      // counted-time rule subtracts only what does not count as work.
      const unpaidBreakMinutes = closed
        .filter((b) => !b.isPaid)
        .reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

      await tx.timeEntry.update({
        where: { id: entry.id },
        data: {
          breakMinutes: totalBreakMinutes,
          unpaidBreakMinutes,
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
        select: { durationMinutes: true, isPaid: true },
      });
      const remainingMinutes = remaining.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);
      const remainingUnpaid = remaining
        .filter((b) => !b.isPaid)
        .reduce((sum, b) => sum + (b.durationMinutes || 0), 0);
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

  async endBreak(data: {
    userId: string;
    organizationId: string;
    notes?: string;
    /** The break this ends, named by a phone that started it offline. */
    breakId?: string;
    /** When the tap happened, for a break ended offline. */
    evidence?: OccurrenceEvidence;
  }) {
    this.logger.log(`End break: user=${data.userId}`);

    /*
      A named break that is already over: the same tap sent twice gets the same
      answer; one ended some other way is a conflict, never overwritten.
    */
    if (data.breakId) {
      const named = await this.prisma.break.findFirst({
        where: { id: data.breakId, timeEntry: { userId: data.userId, organizationId: data.organizationId } },
      });
      if (!named) throw new BadRequestException('You are not currently on a break');
      if (named.endedAt) {
        const tapAt = data.evidence ? new Date(data.evidence.occurredAt).getTime() : NaN;
        if (Math.abs(named.endedAt.getTime() - tapAt) <= SAME_TAP_MS) return success(named, 'Break ended');
        throw new ConflictException({
          message: 'This break was already ended before your change arrived',
          code: 'BREAK_ALREADY_ENDED',
          params: { current: { id: named.id, endedAt: named.endedAt } },
        });
      }
    }

    // Find active clock-in entry with active break
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        breaks: {
          where: { endedAt: null, ...(data.breakId ? { id: data.breakId } : {}) },
        },
      },
    });

    if (!entry) {
      throw new BadRequestException('You must be clocked in to end a break');
    }

    if (!entry.breaks || entry.breaks.length === 0) {
      throw new BadRequestException('You are not currently on a break');
    }

    const activeBreak = entry.breaks[0];
    const now = judgeOccurrence(data.evidence, activeBreak.startedAt).at;
    const durationMinutes = Math.round(
      (now.getTime() - activeBreak.startedAt.getTime()) / (1000 * 60),
    );

    // Update break record
    const updatedBreak = await this.prisma.break.update({
      where: { id: activeBreak.id },
      data: {
        endedAt: now,
        durationMinutes,
        notes: data.notes || activeBreak.notes,
      },
    });

    // Update total break minutes on time entry
    const allBreaks = await this.prisma.break.findMany({
      where: {
        timeEntryId: entry.id,
        endedAt: { not: null },
      },
    });

    const totalBreakMinutes = allBreaks.reduce(
      (sum, b) => sum + (b.durationMinutes || 0),
      0,
    );

    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: { breakMinutes: totalBreakMinutes },
    });

    /*
      Unpaid minutes, tracked apart from the total.

      A paid rest is time at work; an unpaid one is not. The counted-time rule
      reads only the unpaid figure, and the screen shows the total — so the two
      are stored separately rather than one being inferred from the other.
    */
    const unpaidBreakMinutes = allBreaks
      .filter((b) => !b.isPaid)
      .reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

    // The rest is over: point the sweep at whatever is next, or at nothing.
    const plan = parseBreakPlan(entry.breakPlan);
    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        unpaidBreakMinutes,
        nextBreakRemindAt: plan.length ? nextRestAt(plan, now) : null,
      },
    });

    // Harmless on an open shift (there is no paid figure yet) and necessary on a
    // closed one, which is what `endBreakManually` reaches.
    await this.countedTime.recomputeClosed({
      ...entry,
      breakMinutes: totalBreakMinutes,
      unpaidBreakMinutes,
    });

    // Get user info for notification
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { firstName: true, lastName: true },
    });

    // Emit break ended notification
    this.notificationClient.emit('break_ended', {
      userId: data.userId,
      userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
      breakId: updatedBreak.id,
      breakType: updatedBreak.type,
      startedAt: activeBreak.startedAt.toISOString(),
      endedAt: now.toISOString(),
      durationMinutes,
      organizationId: data.organizationId,
    });

    this.logger.log(
      `Break ended: break=${updatedBreak.id}, duration=${durationMinutes}min, totalBreakMinutes=${totalBreakMinutes}`,
    );

    return success(updatedBreak, `Break ended (${durationMinutes} minutes)`);
  }

  /**
   * Get current break status
   */
  /**
   * "Later."
   *
   * Moves the rest out by its own interval and counts the answer. The COUNT is
   * what matters and it is kept here, not on the phone: otherwise "Later" is a
   * mute button, and a device that is off, flat or in a basement silences an
   * alarm by not existing.
   *
   * Past the cap the rest is recorded as MISSED and the asking stops — a phone
   * in a locker collecting forty notifications is how people learn to turn a
   * notification channel off entirely.
   */
  async snoozeBreak(data: { userId: string; organizationId: string; ruleId?: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      select: { id: true, breakPlan: true, locationId: true, shiftId: true },
    });
    if (!entry) throw new BadRequestException('You must be clocked in');

    const plan = parseBreakPlan(entry.breakPlan);
    const target = data.ruleId
      ? plan.find((i) => i.ruleId === data.ruleId)
      : outstandingBreaks(plan)[0];
    if (!target) return { success: true, data: { snoozed: false }, message: 'Nothing to postpone' };

    /*
      The cadence comes from the PLAN, not the rule.

      It was frozen there at clock-in with everything else, so this needs no
      lookup — and, more importantly, a rule edited at noon cannot change how
      insistent somebody's afternoon is. The floor and the cap are still the
      shared rule's, which is what stops a misconfiguration becoming a storm.
    */
    const updated = snoozePlan(plan, target.ruleId, {
      snoozeMin: target.snoozeMin,
      maxSnoozes: target.maxSnoozes,
    });
    const item = updated.find((i) => i.ruleId === target.ruleId)!;

    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: { breakPlan: updated as never, nextBreakRemindAt: nextRestAt(updated, new Date()) },
    });

    this.logger.log(
      `Rest postponed: entry=${entry.id} rest=${target.name} count=${item.snoozeCount} state=${item.state}`,
    );
    return {
      success: true,
      data: { snoozed: item.state === 'SNOOZED', state: item.state, dueAt: item.dueAt, snoozeCount: item.snoozeCount },
      message: item.state === 'MISSED' ? 'Recorded as not taken' : 'We will ask again shortly',
    };
  }

  async getBreakStatus(data: { userId: string; organizationId: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        breaks: {
          orderBy: { startedAt: 'desc' },
        },
      },
    });

    if (!entry) {
      return success({
        isClockedIn: false,
        isOnBreak: false,
        currentBreak: null,
        todayBreaks: [],
        totalBreakMinutes: 0,
      });
    }

    const activeBreak = entry.breaks.find((b) => !b.endedAt);
    const completedBreaks = entry.breaks.filter((b) => b.endedAt);
    const totalBreakMinutes = completedBreaks.reduce(
      (sum, b) => sum + (b.durationMinutes || 0),
      0,
    );

    return success({
      isClockedIn: true,
      isOnBreak: !!activeBreak,
      currentBreak: activeBreak || null,
      todayBreaks: entry.breaks,
      totalBreakMinutes,
    });
  }

  /**
   * Get breaks for a time entry
   */
  async getBreaksForEntry(data: { timeEntryId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.timeEntryId,
        organizationId: data.organizationId,
        // An entry outside the caller's granted spaces reads as 'not found'.
        ...scopeWhere(data.scopeSpaceIds),
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    const breaks = await this.prisma.break.findMany({
      where: { timeEntryId: data.timeEntryId },
      // Who entered it, when it was not the member — the same distinction the
      // history and active listings carry. Without it this endpoint could not
      // tell a manually-added break from one somebody took.
      include: { addedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startedAt: 'asc' },
    });

    const totalMinutes = breaks.reduce(
      (sum, b) => sum + (b.durationMinutes || 0),
      0,
    );

    return success({
      breaks,
      totalBreakMinutes: totalMinutes,
      breakCount: breaks.length,
    });
  }

  /**
   * Get all active breaks in the organization (admin view)
   */
  async getActiveBreaks(data: { organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    const breaks = await this.prisma.break.findMany({
      where: {
        endedAt: null, // Active breaks
        timeEntry: {
          organizationId: data.organizationId,
          // Only the caller's granted spaces — see attendance-scope.ts.
          ...scopeWhere(data.scopeSpaceIds),
        },
      },
      include: {
        // See getBreakHistory — the same distinction matters on a live break.
        addedBy: { select: { id: true, firstName: true, lastName: true } },
        timeEntry: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            location: true,
          },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    // Flatten the structure for easier consumption
    const flattenedBreaks = breaks.map((b) => ({
      ...b,
      user: b.timeEntry?.user,
      location: b.timeEntry?.location,
    }));

    return success(flattenedBreaks);
  }

  /**
   * Get break history with filters (admin view)
   */
  async getBreakHistory(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    organizationId: string;
    date?: string;
    userId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page || 1;
    const limit = data.limit || 50;
    const skip = (page - 1) * limit;

    // Build date filter using shared utility
    const dateFilter = data.date
      ? { startedAt: buildSingleDayFilter(data.date) }
      : {};

    // Build where clause
    const where: any = {
      ...dateFilter,
      timeEntry: {
        organizationId: data.organizationId,
        // Only the caller's granted spaces — see attendance-scope.ts.
        ...scopeWhere(data.scopeSpaceIds),
        ...(data.userId ? { userId: data.userId } : {}),
      },
      ...(data.type ? { type: data.type } : {}),
    };

    const [breaks, total] = await Promise.all([
      this.prisma.break.findMany({
        where,
        include: {
          /*
            Who entered this, when it was not the member.

            NULL for a break somebody recorded themselves, which is almost all of
            them. Selected here because the reason for storing it at all is that a
            reader can tell the two apart — an audit trail nobody can see is a
            column, not an audit trail.
          */
          addedBy: { select: { id: true, firstName: true, lastName: true } },
          timeEntry: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              location: true,
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.break.count({ where }),
    ]);

    // Flatten the structure
    const flattenedBreaks = breaks.map((b) => ({
      ...b,
      user: b.timeEntry?.user,
      location: b.timeEntry?.location,
    }));

    return paginated(flattenedBreaks, {
      total,
      page,
      limit,
    });
  }

  /**
   * End a break manually (admin action)
   */
  async endBreakManually(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    breakId: string;
    adminId: string;
    organizationId: string;
    notes?: string;
  }) {
    const breakRecord = await this.prisma.break.findFirst({
      where: {
        id: data.breakId,
        endedAt: null, // Must be active
        timeEntry: {
          organizationId: data.organizationId,
          // Only the caller's granted spaces — see attendance-scope.ts.
          ...scopeWhere(data.scopeSpaceIds),
        },
      },
      include: {
        timeEntry: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!breakRecord) {
      throw new NotFoundException('Active break not found');
    }

    const endedAt = new Date();
    const durationMinutes = Math.floor(
      (endedAt.getTime() - new Date(breakRecord.startedAt).getTime()) / 60000,
    );

    const updatedBreak = await this.prisma.break.update({
      where: { id: data.breakId },
      data: {
        endedAt,
        durationMinutes,
        notes: data.notes
          ? `[Admin ended] ${data.notes}`
          : `[Admin ended by ${data.adminId}]`,
      },
    });

    // Update time entry break minutes
    const totalBreakMinutes = await this.prisma.break.aggregate({
      where: {
        timeEntryId: breakRecord.timeEntryId,
        durationMinutes: { not: null },
      },
      _sum: {
        durationMinutes: true,
      },
    });

    await this.prisma.timeEntry.update({
      where: { id: breakRecord.timeEntryId },
      data: {
        breakMinutes: totalBreakMinutes._sum.durationMinutes || 0,
      },
    });

    this.logger.log(
      `Admin ${data.adminId} ended break ${data.breakId} for user ${breakRecord.timeEntry.user.firstName} ${breakRecord.timeEntry.user.lastName}`,
    );

    return success(updatedBreak, `Break ended by admin (${durationMinutes} minutes)`);
  }

  /**
   * Get break summary statistics for a date range
   */
  async getBreakSummary(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    organizationId: string;
    startDate: string;
    endDate: string;
    userId?: string;
  }) {
    const dateFilter = buildDateRangeFilter(data.startDate, data.endDate);

    // Build where clause
    const where: any = {
      startedAt: dateFilter,
      timeEntry: {
        organizationId: data.organizationId,
        // Only the caller's granted spaces — see attendance-scope.ts.
        ...scopeWhere(data.scopeSpaceIds),
        ...(data.userId ? { userId: data.userId } : {}),
      },
      durationMinutes: { not: null }, // Only completed breaks
    };

    // Get all breaks in the period
    const breaks = await this.prisma.break.findMany({
      where,
      select: {
        type: true,
        durationMinutes: true,
      },
    });

    // Calculate statistics
    const totalBreaks = breaks.length;
    const totalBreakMinutes = breaks.reduce(
      (sum, b) => sum + (b.durationMinutes || 0),
      0,
    );
    const averageBreakMinutes =
      totalBreaks > 0 ? Math.round(totalBreakMinutes / totalBreaks) : 0;

    // Group by type
    const breaksByType = {
      LUNCH: { count: 0, totalMinutes: 0 },
      SHORT: { count: 0, totalMinutes: 0 },
      OTHER: { count: 0, totalMinutes: 0 },
    };

    for (const b of breaks) {
      const type = b.type as 'LUNCH' | 'SHORT' | 'OTHER';
      if (breaksByType[type]) {
        breaksByType[type].count++;
        breaksByType[type].totalMinutes += b.durationMinutes || 0;
      }
    }

    // Calculate averages per type
    for (const type of Object.keys(breaksByType) as Array<'LUNCH' | 'SHORT' | 'OTHER'>) {
      if (breaksByType[type].count > 0) {
        (breaksByType[type] as any).averageMinutes = Math.round(
          breaksByType[type].totalMinutes / breaksByType[type].count,
        );
      } else {
        (breaksByType[type] as any).averageMinutes = 0;
      }
    }

    return success({
      period: {
        startDate: data.startDate,
        endDate: data.endDate,
      },
      totalBreaks,
      totalBreakMinutes,
      averageBreakMinutes,
      breaksByType,
    });
  }
}
