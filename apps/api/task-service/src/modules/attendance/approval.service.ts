import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { JobPauseService } from '../tasks/handover/job-pause.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  paginated,
  ApprovalStatus,
  computeScheduleFlags,
  computeCountedTime,
  SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  SCHEDULE_TIME_FLAGS,
  flagsAgainstDailyLimit,
  SERVICE_NAMES,
  toISODateString,
  parseBreakPlan,
  flagsWithMissedRest,
  breakTotals,
  endRunningBreaks,
} from '@hbcfield/shared';
import { clampListLimit, clampListPage } from '@hbcfield/shared';
import { assertNotSelfDecision } from './self-decision';
import { zonedWallTimeToUtc as sharedZonedWallTimeToUtc, localPartsIn, parseHm } from '@hbcfield/shared';
import { scopeWhere, scopeAllows, type AttendanceScope } from '@hbcfield/shared';
import { CountedTimeService } from './counted-time.service';
import { ShiftRematchService } from './shift-rematch.service';
import { MEMBER_SELECT } from './attendance-selects';
import { approvalFor } from './attendance-occurrence';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    // An admin editing hours moves the paid figure like any other close path.
    private readonly countedTime: CountedTimeService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    // An edited entry that still holds no shift gets another look at the rota.
    @Optional() private readonly rematch?: ShiftRematchService,
    // A manager closing an open shift ends it like any clock-out: jobs left in work pause.
    @Optional() private readonly jobPause?: JobPauseService,
  ) {}

  /**
   * Broadcast that an admin mutated attendance (edit/approve/reject/delete/manual
   * add) so every open attendance view refreshes in real time — same idea as the
   * clock-in/out events, but for manager-side changes which had no signal before.
   */
  private emitChanged(organizationId: string, action: string, entryId?: string) {
    try {
      this.notificationClient.emit('attendance_changed', { organizationId, action, entryId });
    } catch (err) {
      this.logger.warn(`attendance_changed emit failed (${action}): ${err}`);
    }
  }

  /**
   * Get entries pending approval
   */
  async getPendingApprovals(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    organizationId: string;
    page?: number;
    limit?: number;
    /** Just the counts — how many, and how many per workspace (the home's Crew card). */
    summary?: boolean;
  }) {
    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 20);
    const skip = (page - 1) * limit;

    const where = {
      organizationId: data.organizationId,
      // Only the caller's granted spaces — an entry outside them reads as
      // 'not found', which is also the right thing to tell them.
      ...scopeWhere(data.scopeSpaceIds),
      approvalStatus: ApprovalStatus.PENDING,
      status: { not: 'CLOCKED_IN' as any }, // Only completed entries
    };

    /*
      ⭐ COUNTS WITHOUT THE ROWS. The Crew card needs the total and a count per
      workspace; it used to download a whole page of shifts (170 KB for 95)
      every minute to count them itself. One grouped count answers it in bytes.
    */
    if (data.summary) {
      const groups = await this.prisma.timeEntry.groupBy({ by: ['locationId'], where, _count: { _all: true } });
      const bySpace: Record<string, number> = {};
      let total = 0;
      for (const g of groups) {
        total += g._count._all;
        if (g.locationId) bySpace[g.locationId] = g._count._all;
      }
      return { total, bySpace };
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: MEMBER_SELECT,
          },
          location: {
            select: { id: true, name: true, timezone: true },
          },
          breaks: true,
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Approve a time entry
   */
  async approveEntry(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    entryId: string;
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
        // Only the caller's granted spaces — an entry outside them reads as
        // 'not found', which is also the right thing to tell them.
        ...scopeWhere(data.scopeSpaceIds),
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    // A second party approves hours — the overtime rule (self-decision.ts).
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.approverId,
      subjectId: entry.userId,
      organizationId: data.organizationId,
      message: 'You cannot approve your own time entry. Ask a manager or an administrator.',
    });

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException(
        `Entry is already ${entry.approvalStatus.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.notes,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        location: {
          select: { name: true, timezone: true },
        },
      },
    });

    this.logger.log(
      `Entry approved: entry=${data.entryId}, approver=${data.approverId}`,
    );

    this.emitChanged(data.organizationId, 'approve', data.entryId);
    return success(updated, 'Time entry approved');
  }

  /**
   * Reject a time entry
   */
  async rejectEntry(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    entryId: string;
    approverId: string;
    organizationId: string;
    reason: string;
  }) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
        // Only the caller's granted spaces — an entry outside them reads as
        // 'not found', which is also the right thing to tell them.
        ...scopeWhere(data.scopeSpaceIds),
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    // Deciding your own entry, either way, needs somebody else (self-decision.ts).
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.approverId,
      subjectId: entry.userId,
      organizationId: data.organizationId,
      message: 'You cannot decide your own time entry. Ask a manager or an administrator.',
    });

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException(
        `Entry is already ${entry.approvalStatus.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.reason,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(
      `Entry rejected: entry=${data.entryId}, approver=${data.approverId}, reason=${data.reason}`,
    );

    this.emitChanged(data.organizationId, 'reject', data.entryId);
    return success(updated, 'Time entry rejected');
  }

  /** Duration of a shift window in minutes from its "HH:MM" start/end strings. */
  private shiftDurationMinutes(startTime: string, endTime: string, crossesMidnight: boolean): number {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let dur = eh * 60 + em - (sh * 60 + sm);
    if (crossesMidnight || dur <= 0) dur += 24 * 60; // overnight window
    return dur;
  }

  /**
   * The expected start and the tolerance an edit re-reads the flags against.
   *
   * ⚠️ The start is the PERSISTED `expectedClockInAt` — stamped at clock-in by
   * the shift resolver for a rota shift AND for the legacy weekly schedule. This
   * used to be derived from the bound shift's length, which needs a `shiftId`,
   * so every legacy-schedule entry lost its LATE_ARRIVAL on its first edit. The
   * derivation survives only for rows older than the persisted column.
   *
   * One shift read at most: the tolerance rides on the same row.
   */
  private async expectationFor(entry: {
    shiftId: string | null;
    expectedClockInAt: Date | null;
    expectedClockOutAt: Date | null;
  }): Promise<{ expectedStart: Date | null; toleranceMin: number }> {
    if (entry.expectedClockInAt || !entry.shiftId || !entry.expectedClockOutAt) {
      return {
        expectedStart: entry.expectedClockInAt ?? null,
        toleranceMin: await this.countedTime.toleranceFor(entry.shiftId),
      };
    }
    const shift = await this.prisma.shift.findUnique({
      where: { id: entry.shiftId },
      select: { startLocal: true, endLocal: true, crossesMidnight: true, flagToleranceMin: true },
    });
    if (!shift) return { expectedStart: null, toleranceMin: SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN };
    const dur = this.shiftDurationMinutes(shift.startLocal, shift.endLocal, shift.crossesMidnight);
    return {
      expectedStart: new Date(entry.expectedClockOutAt.getTime() - dur * 60_000),
      toleranceMin: shift.flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
    };
  }

  /**
   * One row in the shared activity log per office change to an entry — the
   * indexed per-entity audit trail ([resourceId, createdAt]); no dedicated
   * table. Edits feed the entry's edit-history table; a deletion leaves the only
   * trace there is once the row is gone. Never fails the change it records.
   */
  private async auditEntry(params: {
    eventType: 'TIME_ENTRY_EDITED' | 'TIME_ENTRY_DELETED';
    entryId: string;
    actorId: string;
    organizationId: string;
    targetUserId?: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      await this.prisma.activityLog.create({
        data: {
          eventType: params.eventType,
          userId: params.actorId,
          ...(params.targetUserId ? { targetUserId: params.targetUserId } : {}),
          resourceType: 'timeEntry',
          resourceId: params.entryId,
          organizationId: params.organizationId,
          metadata: params.metadata as never,
        },
      });
    } catch (e) {
      this.logger.warn(`Audit-log write failed (${params.eventType}) for entry=${params.entryId}: ${e}`);
    }
  }

  /**
   * Edit a time entry (manager correction)
   */
  async editEntry(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    entryId: string;
    editorId: string;
    organizationId: string;
    clockInAt?: string;
    clockOutAt?: string;
    notes?: string;
    timezone?: string;
    reason: string;
  }) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('Edit reason is required');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
        // Only the caller's granted spaces — an entry outside them reads as
        // 'not found', which is also the right thing to tell them.
        ...scopeWhere(data.scopeSpaceIds),
      },
      // The rows ride along: closing an open entry ends its running rest, and
      // the totals are recomputed from these — no second read.
      include: { breaks: true },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    // Correcting your own clock times is the same as approving them: an edit
    // is what payroll reads. Somebody else makes it (self-decision.ts).
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.editorId,
      subjectId: entry.userId,
      organizationId: data.organizationId,
      message: 'You cannot edit your own time entry. Ask a manager or an administrator.',
    });

    const parseTime = (v: string | undefined): Date | undefined => {
      if (!v) return undefined;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException({ code: 'ENTRY_TIME_INVALID', message: 'Clock times must be valid times.' });
      }
      return d;
    };
    const editedIn = parseTime(data.clockInAt);
    const editedOut = parseTime(data.clockOutAt);
    const newClockIn: Date = editedIn ?? entry.clockInAt;
    const newClockOut: Date | null = editedOut ?? entry.clockOutAt ?? null;
    const timesChanged = !!(editedIn || editedOut);

    /*
      A clock-out at or before the clock-in is refused, not stored.

      It used to be written: a negative `totalMinutes`, a counted window ending
      before it began (clamped to zero by the counted-time rule, so the shift
      silently counted nothing), and a row no later edit could reason about.
      Checked on the RESULTING pair, so moving only the clock-in past an existing
      clock-out is caught too.
    */
    if (timesChanged && newClockOut && newClockOut.getTime() <= newClockIn.getTime()) {
      throw new BadRequestException({
        code: 'CLOCK_OUT_BEFORE_CLOCK_IN',
        message: 'The clock-out must be after the clock-in.',
      });
    }

    const updateData: any = {
      isEdited: true,
      editedById: data.editorId,
      editedAt: new Date(),
      editReason: data.reason,
    };

    // Save original values on first edit
    if (!entry.isEdited) {
      updateData.originalClockIn = entry.clockInAt;
      updateData.originalClockOut = entry.clockOutAt;
    }

    if (editedIn) updateData.clockInAt = editedIn;
    if (editedOut) updateData.clockOutAt = editedOut;

    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    // Admin can correct the entry's display timezone (e.g. old rows that fell
    // back to the space's Europe/Berlin default but were really clocked in the US).
    if (data.timezone) {
      updateData.timezone = data.timezone;
    }

    let flags: string[] = [...(entry.flagReasons ?? [])];
    const closingOpen = entry.status === 'CLOCKED_IN' && !!newClockOut;

    /*
      Re-evaluate the schedule-relative flags when the times change — otherwise
      a corrected clock-in keeps a stale LATE_ARRIVAL (e.g. a "forgot to clock
      in" fix from 1:39 AM back to the 6 PM shift start still showed Late
      Arrival). Same shared rule as clock-in / clock-out, the same set of
      time-dependent flags (SCHEDULE_TIME_FLAGS, the daily limit included), and a
      daily allowance read as an allowance rather than a shift.
    */
    let toleranceMin: number | undefined;
    if (timesChanged) {
      const expectation = await this.expectationFor(entry);
      toleranceMin = expectation.toleranceMin;
      const recomputed = flagsAgainstDailyLimit(
        computeScheduleFlags({
          clockInAt: newClockIn,
          clockOutAt: newClockOut,
          expectedClockInAt: expectation.expectedStart,
          expectedClockOutAt: entry.expectedClockOutAt ?? null,
          toleranceMin,
        }),
        entry.endIsDailyLimit,
      );
      flags = [...flags.filter((f) => !SCHEDULE_TIME_FLAGS.has(f)), ...recomputed];

      /*
        ⚠️ A temporarily closed entry the office has corrected is no longer
        temporary. The member's real clock-out replaces a provisional one — its
        claim matches `clockOutProvisional: true` — so leaving the mark set let a
        late-arriving phone tap silently overwrite the manager's correction, with
        nothing on screen to say so. The office's times are now the record;
        MISSED_CLOCK_OUT stays, because that is still what happened.
      */
      if (entry.clockOutProvisional) {
        updateData.clockOutProvisional = false;
        updateData.clockOutBasis = null;
        flags = flags.filter((f) => f !== 'CLOCK_OUT_PROVISIONAL');
      }
    }

    // A rest still running when the office closes the shift ends at the new
    // clock-out — what the open-shift close does with a forgotten one.
    let totals = { breakMinutes: entry.breakMinutes ?? 0, unpaidBreakMinutes: entry.unpaidBreakMinutes ?? 0 };
    let endedBreaks: Array<{ id: string; endedAt: Date; durationMinutes: number }> = [];
    if (closingOpen && entry.breaks.some((b) => !b.endedAt)) {
      const closed = endRunningBreaks(entry.breaks, newClockOut!);
      endedBreaks = closed.ended;
      totals = breakTotals(closed.rows);
      updateData.breakMinutes = totals.breakMinutes;
      updateData.unpaidBreakMinutes = totals.unpaidBreakMinutes;
    }

    if (closingOpen) {
      // A required rest that had fallen due and was never taken is flagged for a
      // person at the close — and never deducted (break-plan.ts).
      flags = flagsWithMissedRest(flags, parseBreakPlan(entry.breakPlan), newClockOut);
    }

    if (timesChanged || closingOpen) {
      flags = [...new Set(flags)];
      updateData.flagReasons = flags;
    }

    if (newClockOut) {
      updateData.totalMinutes = Math.round((newClockOut.getTime() - newClockIn.getTime()) / 60_000);

      /*
        …and the counted window moves with it, through the SAME seam every other
        close path uses (`CountedTimeService.columnsFor`).

        ⚠️ This used to call the arithmetic inline with `breakMinutes` as the
        rest to subtract, so an office edit took EVERY rest off — paid ones too —
        while the clock-out, the break paths and the reports subtract only the
        rests that do not count as work. Correcting a clock-in by one minute took
        a paid fifteen-minute rest off the shift.
      */
      const counted = await this.countedTime.columnsFor(
        { ...entry, clockInAt: newClockIn, ...totals },
        newClockOut,
        toleranceMin,
      );
      updateData.countedStartAt = counted.countedStartAt;
      updateData.countedEndAt = counted.countedEndAt;
      updateData.paidMinutes = counted.paidMinutes;

      // Adding a clock-out to a still-open entry closes it. Without this the row
      // keeps status CLOCKED_IN and shows "Active" despite having a clock-out
      // time + duration (the manual clock-out bug). A system AUTO_OUT stays as-is.
      if (closingOpen) {
        updateData.status = 'CLOCKED_OUT';
        updateData.reminderState = 'RESOLVED';
        updateData.nextRemindAt = null;
        // The shift is over: the rest alarm must not go on asking about it.
        updateData.nextBreakRemindAt = null;
        /*
          An admin clocking somebody out reviews the CLOSE — not the rest of the
          day. ⚠️ This approved unconditionally, so an entry flagged for a
          geofence breach, a moved phone clock or a rest not taken left the queue
          because somebody typed a clock-out. Approved only when nothing on it
          still needs a person (the clock-out's own rule, `approvalFor`);
          otherwise it stays PENDING, which is the Approvals tab. A row an admin
          already approved/rejected keeps its decision.
        */
        if (entry.approvalStatus === 'PENDING' || entry.approvalStatus === 'AUTO') {
          if (approvalFor(flags) === 'AUTO') {
            updateData.approvalStatus = 'APPROVED';
            updateData.approvedById = data.editorId;
            updateData.approvedAt = new Date();
            updateData.approvalNotes = 'Auto-approved: manual clock-out by admin';
          } else {
            updateData.approvalStatus = 'PENDING';
          }
        }
      }
    }

    const include = {
      user: { select: { id: true, firstName: true, lastName: true } },
      location: { select: { name: true, timezone: true } },
      editedBy: { select: { id: true, firstName: true, lastName: true } },
    } as const;
    // One transaction when rests end with it: the entry and its rests move
    // together, or a crash between them leaves a closed shift with a rest running.
    const updated = endedBreaks.length
      ? await this.prisma.$transaction(async (tx) => {
          for (const b of endedBreaks) {
            await tx.break.update({ where: { id: b.id }, data: { endedAt: b.endedAt, durationMinutes: b.durationMinutes } });
          }
          return tx.timeEntry.update({ where: { id: data.entryId }, data: updateData, include });
        })
      : await this.prisma.timeEntry.update({ where: { id: data.entryId }, data: updateData, include });

    if (entry.status === 'CLOCKED_IN' && updated.status === 'CLOCKED_OUT' && updated.clockOutAt) {
      await this.jobPause?.pauseAtClockOut({
        userId: updated.userId,
        organizationId: data.organizationId,
        at: updated.clockOutAt,
        reason: 'OFFICE_CLOSE',
      });
    }

    // A per-edit row in the shared activity log — what powers the entry's full
    // edit-history table (every edit, from → to).
    const changes: Array<{ field: string; from: string | null; to: string | null }> = [];
    const cmp = (field: string, from?: Date | string | null, to?: Date | string | null) => {
      const f = from instanceof Date ? from.toISOString() : (from ?? null);
      const t = to instanceof Date ? to.toISOString() : (to ?? null);
      if (f !== t) changes.push({ field, from: f, to: t });
    };
    cmp('clockInAt', entry.clockInAt, updated.clockInAt);
    cmp('clockOutAt', entry.clockOutAt, updated.clockOutAt);
    cmp('notes', entry.notes, updated.notes);
    cmp('timezone', entry.timezone, updated.timezone);
    await this.auditEntry({
      eventType: 'TIME_ENTRY_EDITED',
      entryId: data.entryId,
      actorId: data.editorId,
      organizationId: data.organizationId,
      metadata: { reason: data.reason, changes },
    });

    this.logger.log(
      `Entry edited: entry=${data.entryId}, editor=${data.editorId}, reason=${data.reason}`,
    );

    if (!updated.shiftId && (updated.flagReasons ?? []).includes('UNSCHEDULED_DAY')) {
      this.rematch?.schedule({
        organizationId: data.organizationId,
        userId: updated.userId,
        spaceId: updated.locationId,
        from: updated.clockInAt,
        actorId: data.editorId,
      });
    }
    this.emitChanged(data.organizationId, 'edit', data.entryId);
    return success(updated, 'Time entry updated');
  }

  /**
   * Full edit history for an entry — the per-edit audit rows written on each
   * editEntry (org-scoped, newest-first, served by the [resourceId, createdAt]
   * index). Drives the "Edit history" table in the UI.
   */
  async getEntryHistory(data: { entryId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    /*
      Only the caller's granted spaces — an entry outside them reads as 'not
      found'. ⚠️ Asked of the ENTRY: an activity-log row has no space column, and
      spreading `scopeWhere` onto it made every scoped caller's history request
      fail in Prisma on an unknown argument.
    */
    if (data.scopeSpaceIds !== null && data.scopeSpaceIds !== undefined) {
      const inScope = await this.prisma.timeEntry.findFirst({
        where: { id: data.entryId, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
        select: { id: true },
      });
      if (!inScope) throw new NotFoundException('Time entry not found');
    }
    const logs = await this.prisma.activityLog.findMany({
      where: {
        resourceId: data.entryId,
        organizationId: data.organizationId,
        eventType: 'TIME_ENTRY_EDITED',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    return success(
      logs.map((l) => {
        const meta = (l.metadata as { reason?: string; changes?: unknown[] } | null) ?? {};
        return {
          id: l.id,
          editedAt: l.createdAt,
          editor: l.user ? `${l.user.firstName} ${l.user.lastName}`.trim() : null,
          reason: meta.reason ?? null,
          changes: Array.isArray(meta.changes) ? meta.changes : [],
        };
      }),
    );
  }

  /** Admin: delete a time entry (its breaks cascade), scoped to the org. */
  async deleteEntry(data: {
    entryId: string;
    editorId: string;
    organizationId: string;
    scopeSpaceIds?: AttendanceScope;
    reason?: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      // Scoped: an entry in a space the caller was not granted reads as 'not
      // found', which is both the right refusal and the right disclosure.
      where: { id: data.entryId, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
      select: {
        id: true,
        userId: true,
        locationId: true,
        clockInAt: true,
        clockOutAt: true,
        paidMinutes: true,
        approvalStatus: true,
        flagReasons: true,
      },
    });
    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }
    /*
      ⚠️ Deleting is deciding too. A shift leader holding the reconcile grant
      could delete their own flagged or rejected entry — the same move on their
      own record that edit and approve already refuse. Somebody else does it
      (self-decision.ts).
    */
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.editorId,
      subjectId: entry.userId,
      organizationId: data.organizationId,
      message: 'You cannot delete your own time entry. Ask a manager or an administrator.',
    });
    // Break has onDelete: Cascade, so removing the entry removes its breaks.
    await this.prisma.timeEntry.delete({ where: { id: data.entryId } });
    // The row is gone, so this is the record that it existed and who removed it.
    await this.auditEntry({
      eventType: 'TIME_ENTRY_DELETED',
      entryId: data.entryId,
      actorId: data.editorId,
      organizationId: data.organizationId,
      targetUserId: entry.userId,
      metadata: {
        reason: data.reason?.trim() || null,
        entry: {
          userId: entry.userId,
          locationId: entry.locationId,
          clockInAt: entry.clockInAt.toISOString(),
          clockOutAt: entry.clockOutAt ? entry.clockOutAt.toISOString() : null,
          paidMinutes: entry.paidMinutes ?? null,
          approvalStatus: entry.approvalStatus,
          flagReasons: entry.flagReasons ?? [],
        },
      },
    });
    this.logger.log(`Entry deleted: entry=${data.entryId}, editor=${data.editorId}`);
    this.emitChanged(data.organizationId, 'delete', data.entryId);
    return success({ id: data.entryId }, 'Time entry removed');
  }

  /**
   * Admin: manually add (back-date) attendance for an employee.
   * Generates one CLOCKED_OUT entry per selected working day in [startDate, endDate],
   * auto-approved and geofence-exempt (no GPS needed for historical data).
   * Skips days that already have an entry for that employee (safe to re-run).
   */
  async addManualEntries(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    editorId: string;
    organizationId: string;
    userId: string;
    locationId: string;
    startDate: string; // "YYYY-MM-DD"
    endDate: string; // "YYYY-MM-DD" (inclusive)
    weekdays?: number[]; // 0=Sun..6=Sat; ignored for a single-day add
    startTime: string; // "HH:MM"
    endTime: string; // "HH:MM"
    /*
      The break as the dialogs now describe it: wall-clock times inside the
      shift, with a type and a reason — the same shape the edit dialog sends.

      ⚠️ `breakMinutes` is still accepted. Older clients send it, and a phone that
      has not taken the update must not start failing; it becomes the same break,
      centred, which is what this service already did.
    */
    breakStart?: string;
    breakEnd?: string;
    breakType?: 'SHORT' | 'LUNCH' | 'OTHER';
    breakReason?: string;
    breakMinutes?: number;
    notes?: string;
    reason?: string;
  }) {
    const [user, loc] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: data.userId, organizationId: data.organizationId },
        select: { id: true },
      }),
      this.prisma.companyLocation.findFirst({
        where: { id: data.locationId, organizationId: data.organizationId },
        select: { id: true, lat: true, lng: true, timezone: true },
      }),
    ]);
    if (!user) throw new NotFoundException('Employee not found in your organization');
    if (!loc) throw new NotFoundException('Work site not found');
    /*
      Back-dating attendance NAMES its space, so the check is the other way
      round from a read: not "which spaces may they see" but "were they granted
      THIS one". Without it, a supervisor scoped to one site could write hours
      into any site in the organization — which is worse than reading them.
    */
    if (!scopeAllows(data.scopeSpaceIds, data.locationId)) {
      throw new NotFoundException('Work site not found');
    }
    // Back-filling hours onto your OWN record is writing your own pay.
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.editorId,
      subjectId: data.userId,
      organizationId: data.organizationId,
      message: 'You cannot add hours to your own record. Ask a manager or an administrator.',
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
      throw new BadRequestException('Invalid date range');
    }
    if (!/^\d{2}:\d{2}$/.test(data.startTime) || !/^\d{2}:\d{2}$/.test(data.endTime)) {
      throw new BadRequestException('Invalid time');
    }
    if (data.endDate < data.startDate) throw new BadRequestException('End date is before the start date');

    /*
      A rest cannot be longer than the shift it sits in.

      The shift is the same length every day of a back-fill, so this is answered
      once, here, rather than per entry — and it has to be answered at all: the
      break is placed inside the shift, and a rest that does not fit would run
      past the clock-out. The edit dialog refuses exactly this when a human types
      it; entering it as a number must not be the way around that.

      Equal is refused too. A shift that is entirely rest is not a shift.
    */
    const mins = (v: string) => {
      const [h, m] = v.split(':').map(Number);
      return h * 60 + m;
    };
    const shiftStart = mins(data.startTime);
    let shiftEnd = mins(data.endTime);
    if (shiftEnd <= shiftStart) shiftEnd += 24 * 60; // overnight, as below

    /*
      Where the break sits, as an offset from the clock-in.

      Given times, that is what they say — and measuring from the clock-in is
      what lets a range of days each get the break at the same time of day, which
      is what a wall-clock time means. Given only a number of minutes — an older
      client — it is centred, which is what this service did before there was
      anywhere to say when the break was taken.
    */
    let breakOffsetMin = 0;
    let breakMin = 0;
    if (data.breakStart && data.breakEnd) {
      if (!/^\d{2}:\d{2}$/.test(data.breakStart) || !/^\d{2}:\d{2}$/.test(data.breakEnd)) {
        throw new BadRequestException('Invalid break time');
      }
      let bs = mins(data.breakStart);
      if (bs < shiftStart) bs += 24 * 60; // inside an overnight shift
      let be = mins(data.breakEnd);
      if (be <= bs) be += 24 * 60;
      if (bs < shiftStart || be > shiftEnd) {
        throw new BadRequestException('The break must sit inside the shift.');
      }
      breakOffsetMin = bs - shiftStart;
      breakMin = be - bs;
    } else {
      breakMin = Math.max(0, Math.round(data.breakMinutes ?? 0));
      if (breakMin >= shiftEnd - shiftStart) {
        throw new BadRequestException(
          `A ${breakMin}-minute rest does not fit in a ${shiftEnd - shiftStart}-minute shift.`,
        );
      }
      breakOffsetMin = Math.max(0, (shiftEnd - shiftStart - breakMin) / 2);
    }

    const tz = loc.timezone || 'Europe/Berlin';
    const single = data.startDate === data.endDate;
    const weekdays = single ? null : data.weekdays?.length ? data.weekdays : [1, 2, 3, 4, 5];
    const reason = data.reason?.trim() || 'Manually added by admin';

    // Cap the span so an accidental multi-year range can't mass-insert. One
    // backfill covers at most a year (weekday filtering trims it further).
    const cur = new Date(`${data.startDate}T12:00:00Z`);
    const endD = new Date(`${data.endDate}T12:00:00Z`);
    const spanDays = Math.round((endD.getTime() - cur.getTime()) / 86_400_000) + 1;
    if (spanDays > 366) {
      throw new BadRequestException('Date range too large — back-fill at most one year at a time');
    }

    // Wall time in the site's zone → UTC, through the shared two-pass rule
    // (attendance/zoned-time). The private copy this replaces read the offset
    // ONCE, at a naive guess, so on a daylight-saving day a back-filled 06:00
    // landed at 05:00 or 07:00 — exactly the night-shift days it matters.
    const zonedWallTimeToUtc = (dateStr: string, timeStr: string): Date => {
      const [h, m] = parseHm(timeStr);
      return sharedZonedWallTimeToUtc(dateStr, h, m, tz);
    };
    const utcToZonedYmd = (date: Date): string => localPartsIn(date, tz).dateStr;

    // Target dates (weekday-filtered for a range; the single day is always included)
    const dates: string[] = [];
    while (cur <= endD) {
      if (single || (weekdays && weekdays.includes(cur.getUTCDay()))) {
        dates.push(toISODateString(cur));
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (!dates.length) throw new BadRequestException('No matching days in the selected range');

    // Skip days the employee already has an entry for (dedupe / safe re-run)
    const existing = await this.prisma.timeEntry.findMany({
      where: {
        userId: data.userId,
        clockInAt: {
          gte: zonedWallTimeToUtc(data.startDate, '00:00'),
          lte: zonedWallTimeToUtc(data.endDate, '23:59'),
        },
      },
      select: { clockInAt: true },
    });
    const taken = new Set(existing.map((e) => utcToZonedYmd(e.clockInAt)));

    const now = new Date();
    const toCreate: any[] = [];
    let skipped = 0;
    for (const ymd of dates) {
      if (taken.has(ymd)) {
        skipped++;
        continue;
      }
      const clockIn = zonedWallTimeToUtc(ymd, data.startTime);
      let clockOut = zonedWallTimeToUtc(ymd, data.endTime);
      if (clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 24 * 3600_000); // overnight
      /*
        Never a shift that has not happened yet.

        A clock-in is judged against the end of the member's last shift, and a
        tap earlier than that is refused as out of order. A hand-entered shift
        ending next Monday therefore refused every real clock-in until Monday
        evening: the phone showed the member clocked in, the server had nothing,
        and they could neither clock out nor clock in again. Refused here, before
        anything is written, naming the day.
      */
      if (clockOut.getTime() > now.getTime()) {
        throw new BadRequestException({
          code: 'MANUAL_ENTRY_IN_FUTURE',
          message: `A shift can only be added once it has ended — ${ymd} ${data.endTime} is still to come.`,
        });
      }
      /*
        GROSS minutes. The break is stored beside it, never inside it.

        This subtracted `breakMin` here, which made a manually added entry mean
        something different from a clocked one: the clock-out path stores raw
        wall time and `workedMinutes()` nets the break at the point of display.
        Subtracting twice took an hour off every back-filled shift — a 18:00 to
        06:00 night with an hour's break read as ten hours instead of eleven —
        and left nothing to show as a break, because it had been folded away.
      */
      const totalMinutes = Math.max(
        0,
        Math.round((clockOut.getTime() - clockIn.getTime()) / 60000),
      );
      /*
        Counted time on a hand-entered shift.

        No shift was resolved for it — nobody clocked in, so nothing stamped an
        expectation — which means there is nothing to clamp to and the counted
        window IS the entered window, net of the break. Written here rather than
        left null so a back-dated day carries the same three columns as a real
        one and the timesheet does not have to ask which kind it is looking at.
      */
      const counted = computeCountedTime({
        clockInAt: clockIn,
        clockOutAt: clockOut,
        unpaidBreakMinutes: breakMin,
      });

      toCreate.push({
        userId: data.userId,
        organizationId: data.organizationId,
        locationId: data.locationId,
        status: 'CLOCKED_OUT',
        timezone: tz,
        clockInAt: clockIn,
        clockInLat: loc.lat ?? 0,
        clockInLng: loc.lng ?? 0,
        clockInWithinGeofence: true,
        clockOutAt: clockOut,
        clockOutLat: loc.lat ?? 0,
        clockOutLng: loc.lng ?? 0,
        clockOutWithinGeofence: true,
        isRemote: false,
        totalMinutes,
        breakMinutes: breakMin,
        // The break row below is unpaid (isPaid defaults to false), so the
        // unpaid total is the same minutes. Left at its default 0, the entry
        // claimed a break that reduced nothing: any later recount (an edit,
        // an approval) and the report's hours-in-shift read the shift an hour
        // long — 12h for a 06:00–18:00 day with an hour's lunch.
        unpaidBreakMinutes: breakMin,
        countedStartAt: counted.countedStartAt,
        countedEndAt: counted.countedEndAt,
        paidMinutes: counted.paidMinutes,
        notes: data.notes?.trim() || null,
        flagReasons: [],
        approvalStatus: 'APPROVED',
        approvedById: data.editorId,
        approvedAt: now,
        approvalNotes: 'Added by admin',
        isEdited: true,
        editedById: data.editorId,
        editedAt: now,
        editReason: reason,
      });
    }

    /*
      The rest goes in as a real BREAK, not just a number on the entry.

      ⚠️ This wrote `breakMinutes: 30` and created no break rows — and the edit
      dialog lists rows. So the rest was invisible the moment anybody opened the
      entry, and worse: adding ANY break there RECOMPUTES `breakMinutes` from the
      rows (see break.service — "recomputed from the rows, never incremented"),
      so the original thirty minutes was silently destroyed and the paid hours
      moved with it.

      One representation, then. A break is a row; `breakMinutes` is the sum of
      the rows, everywhere. `createMany` does not return ids, so the entries go
      in one at a time when there is a rest to attach — the loop is bounded by
      the same one-year cap as the back-fill above, and costs nothing at all when
      the rest is zero, which is the common case.
    */
    if (toCreate.length) {
      if (breakMin > 0) {
        await this.prisma.$transaction(async (tx) => {
          for (const entry of toCreate) {
            const created = await tx.timeEntry.create({ data: entry, select: { id: true, clockInAt: true, clockOutAt: true } });
            // Measured from the clock-in, so every day of a range gets the
            // break at the same time of day.
            const startedAt = new Date(created.clockInAt.getTime() + breakOffsetMin * 60_000);
            const endedAt = new Date(startedAt.getTime() + breakMin * 60_000);
            await tx.break.create({
              data: {
                timeEntryId: created.id,
                // Not guessed from the length: a 45-minute rest is not evidence
                // of lunch, and the office knows what it was.
                // What the office said it was; OTHER only when nothing was
                // said, which is the older client's payload.
                type: data.breakType ?? 'OTHER',
                startedAt,
                endedAt,
                durationMinutes: breakMin,
                reason: data.breakReason?.trim() || reason,
                // Who entered it — the same field the edit dialog stamps when an
                // admin adds a break to somebody else's shift.
                addedById: data.editorId,
              },
            });
          }
        });
      } else {
        await this.prisma.timeEntry.createMany({ data: toCreate });
      }
    }

    this.logger.log(
      `Manual attendance added: user=${data.userId}, editor=${data.editorId}, created=${toCreate.length}, skipped=${skipped}`,
    );
    if (toCreate.length) this.emitChanged(data.organizationId, 'manual-add');
    return success(
      { created: toCreate.length, skipped },
      `Added ${toCreate.length} ${toCreate.length === 1 ? 'entry' : 'entries'}` +
        (skipped ? ` (skipped ${skipped} — already recorded)` : ''),
    );
  }

  /**
   * Bulk approve entries
   */
  async bulkApprove(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    entryIds: string[];
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const results = {
      approved: [] as string[],
      failed: [] as { id: string; reason: string }[],
    };

    for (const entryId of data.entryIds) {
      try {
        await this.approveEntry({
          entryId,
          approverId: data.approverId,
          organizationId: data.organizationId,
          // Only the caller's granted spaces — an entry outside them reads as
          // 'not found'. ⚠️ This used to spread `scopeWhere(...)` here, which
          // passes `locationId: {in}` — a key approveEntry does not read — so
          // scopeSpaceIds arrived undefined and bulk approval was ORG-WIDE.
          scopeSpaceIds: data.scopeSpaceIds,
          notes: data.notes,
        });
        results.approved.push(entryId);
      } catch (error: any) {
        results.failed.push({ id: entryId, reason: error.message });
      }
    }

    if (results.approved.length) this.emitChanged(data.organizationId, 'bulk-approve');
    return success(results, `Approved ${results.approved.length} entries`);
  }
}
