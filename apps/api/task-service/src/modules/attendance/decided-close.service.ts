import { CLOCK_OUT_TIME_FLAGS, clockOutTimeFlags } from './open-shift-close';
import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { success, TimeEntryStatus } from '@hbcfield/shared';
import { CLOSE_ENTRY_INCLUDE } from './clock-out-helpers';
import { ShiftCloseBase } from './shift-close.base';

/**
 * A shift closed by somebody's answer: the member's "I forgot to clock out", or an
 * office/overtime decision.
 */
@Injectable()
export class DecidedCloseService extends ShiftCloseBase {
  // ==========================================================================
  // SHIFT REMINDER RESPONSES — worker actions + leader approval (Phase 3)
  // These are how an open shift gets resolved. Nothing here is auto-closed by
  // the machine; every path is driven by a human tapping a reminder action.
  // ==========================================================================

  /**
   * Worker responds "I forgot to clock out" with their real leave time
   * (trusted self-report). Closes the entry at that time. If the reported time
   * is beyond the expected shift end, the entry is flagged OVERTIME and lands in
   * the approvals queue for a leader to review — overtime is never paid silently.
   */
  async resolveForgotClockOut(data: { userId: string; entryId: string; clockOutAt: string; organizationId: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        userId: data.userId,
        organizationId: data.organizationId,
        // Open — or closed by the sweep with a temporary time, which is exactly
        // what "when did you leave?" is asking the member to correct.
        OR: [{ status: TimeEntryStatus.CLOCKED_IN }, { status: TimeEntryStatus.CLOCKED_OUT, clockOutProvisional: true }],
      },
      include: { location: true, ...CLOSE_ENTRY_INCLUDE },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');
    const wasProvisional = entry.status === TimeEntryStatus.CLOCKED_OUT;

    const clockOutTime = new Date(data.clockOutAt);
    const now = new Date();
    if (isNaN(clockOutTime.getTime())) throw new BadRequestException('Invalid clock-out time');
    if (clockOutTime.getTime() <= entry.clockInAt.getTime()) {
      throw new BadRequestException('Clock-out time must be after clock-in');
    }
    if (clockOutTime.getTime() > now.getTime() + 60_000) {
      throw new BadRequestException('Clock-out time cannot be in the future');
    }

    // Store GROSS minutes (clock-in → clock-out), consistent with the normal
    // clockOut path — break time lives separately on breakMinutes and is netted
    // out downstream, so we must not pre-subtract it here (that double-counted).
    const totalMinutes = Math.round((clockOutTime.getTime() - entry.clockInAt.getTime()) / 60_000);

    // Not before a rest in the shift ended (the sweep may have ended one).
    const lastRestEnd = (entry.breaks ?? []).reduce<number>((t, b) => (b.endedAt ? Math.max(t, b.endedAt.getTime()) : t), 0);
    if (clockOutTime.getTime() < lastRestEnd) {
      throw new BadRequestException({ message: 'Clock-out time is before a rest in this shift ended', code: 'OUT_OF_ORDER' });
    }

    const base = wasProvisional
      ? (entry.flagReasons || []).filter((f) => f !== 'CLOCK_OUT_PROVISIONAL' && !CLOCK_OUT_TIME_FLAGS.has(f))
      : entry.flagReasons || [];
    /*
      ⚠️ The SAME time flags as a tapped clock-out, tolerance included. This
      path used to flag OVERTIME a single minute past the end and never
      EARLY_DEPARTURE — a forgotten clock-out is a late clock-out, not a
      different kind of day, so it is judged by the same rule.
    */
    const toleranceMin = await this.getShiftFlagTolerance(entry.shiftId);
    const timeFlags = clockOutTimeFlags(entry, clockOutTime, toleranceMin);
    const uniqueFlags = [...new Set<string>([...base, 'MISSED_CLOCK_OUT', ...timeFlags])];
    const isOvertime = timeFlags.includes('OVERTIME') || timeFlags.includes('PAST_DAILY_LIMIT');

    // Claimed: the answer and a real clock-out arriving together must not both write.
    const updated = await this.closeEntry(entry, {
      at: clockOutTime,
      from: wasProvisional ? 'PROVISIONAL' : 'OPEN',
      toleranceMin,
      fields: {
        notes: 'Self-reported clock-out (forgot to clock out)',
        flagReasons: uniqueFlags,
        approvalStatus: 'PENDING', // a forgotten clock-out is always worth a glance
      },
      pause: { reason: 'FORGOT', sinceClockIn: true },
      announce: true,
      readBack: true,
      now,
    });
    if (!updated) {
      throw new ConflictException({ message: 'This shift was closed at the same moment', code: 'ENTRY_ALREADY_CLOSED' });
    }

    await this.sendPendingApprovalAlert({
      entryId: updated.id,
      userId: data.userId,
      organizationId: data.organizationId,
      locationName: entry.location?.name || 'Unknown',
      flagReasons: uniqueFlags,
      totalMinutes,
    });

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return success(updated, `Clocked out. Total time: ${h}h ${m}m${isOvertime ? ' (overtime pending approval)' : ''}`);
  }

  /**
   * End a shift because somebody DECIDED it ends — the legacy overtime flow's
   * "rejected" and "the approval window ran out" (overtime.service.ts).
   *
   * That product's rule is kept: the decision ends the shift, at the moment it
   * is made, as a system close (AUTO_OUT) the approvals queue reviews. What
   * changes is HOW: it used to write the status, the time and the gross minutes
   * and nothing else — no counted columns (so the unapproved overtime counted
   * through the gross-minus-rests fallback), a rest left running, excursions
   * left escalating, reminders still armed, jobs still in work and no event.
   * It goes through `closeEntry` like every other close now.
   *
   * The time recorded is the decision time — evidence of how long they were
   * there. What COUNTS still stops at the planned end (`computeCountedTime`'s
   * min with `expectedClockOutAt`), which a refused or lapsed request never
   * moved: unapproved overtime counts for nothing.
   *
   * Quiet when the shift is no longer open (closed meanwhile, or never this
   * organization's): there is nothing left to end.
   */
  async closeByDecision(input: {
    entryId: string;
    organizationId: string;
    /** What the entry's note says about why it ended. */
    note: string;
    reason: 'CLOCK_OUT' | 'OFFICE_CLOSE' | 'AUTO_CLOSE';
    at?: Date;
  }): Promise<boolean> {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: input.entryId, organizationId: input.organizationId, status: TimeEntryStatus.CLOCKED_IN },
      // The two display labels the clock-out event carries ride in the same read.
      include: { ...CLOSE_ENTRY_INCLUDE, location: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
    });
    if (!entry) return false;
    const now = new Date();
    const at = input.at ?? now;
    const toleranceMin = await this.getShiftFlagTolerance(entry.shiftId);
    const flags = [
      ...new Set([...(entry.flagReasons ?? []), 'MISSED_CLOCK_OUT', ...clockOutTimeFlags(entry, at, toleranceMin)]),
    ];
    const closed = await this.closeEntry(entry, {
      at,
      from: 'OPEN',
      status: TimeEntryStatus.AUTO_OUT,
      toleranceMin,
      fields: {
        // Added to what is already written about the day, never replacing it.
        notes: [entry.notes, input.note].filter(Boolean).join(' · '),
        flagReasons: flags,
        approvalStatus: 'PENDING',
      },
      pause: { reason: input.reason, sinceClockIn: true },
      announce: true,
      readBack: false,
      now,
    });
    return !!closed;
  }
}
