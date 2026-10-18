import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  success,
  judgedByLabelRules,
  readLabelFacts,
  parseBreakPlan,
  flagsWithMissedRest,
  breakTotals,
  endRunningBreaks,
} from '@hbcfield/shared';
import { assertNotSelfDecision } from './self-decision';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { approvalFor } from './attendance-occurrence';
import { editTimeFlags, officeCloseFacts } from './entry-edit-labels';
import { EntryServiceBase } from './entry-service.base';
import type { Prisma } from '@prisma/client';

/** The office correcting one entry: times, rests, the reason — audited. */
@Injectable()
export class EntryEditService extends EntryServiceBase {
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

    const updateData: Prisma.TimeEntryUncheckedUpdateInput = {
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
    let labelFacts = judgedByLabelRules(entry) ? readLabelFacts(entry.labelFacts) : null;
    if (timesChanged) {
      const edited = editTimeFlags({ entry, flags, expectation: await this.expectationFor(entry), newClockIn, newClockOut });
      ({ flags, toleranceMin } = edited);
      labelFacts = edited.labelFacts ?? labelFacts;

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
      // Label rules: a new entry's status follows its labels after every edit, unless a person decided it.
      if (labelFacts && !closingOpen && (entry.approvalStatus === 'PENDING' || entry.approvalStatus === 'AUTO')) {
        updateData.approvalStatus = approvalFor(flags);
      }
      if (labelFacts) updateData.labelFacts = (closingOpen ? officeCloseFacts(labelFacts) : labelFacts) as never;
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

    this.logger.log(`Entry edited: entry=${data.entryId}, editor=${data.editorId}, reason=${data.reason}`);

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
}
