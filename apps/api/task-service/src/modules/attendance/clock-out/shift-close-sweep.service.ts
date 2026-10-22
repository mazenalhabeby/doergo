import { Prisma } from '@prisma/client';
import { isAbandoned } from '../core/open-shift-close';
import { Injectable } from '@nestjs/common';
import {
  success,
  TimeEntryStatus,
  OPEN_SHIFT_CLOSE,
  AUTO_CLOCK_LIMITS,
  clocksByPresence,
  presenceCloseDue,
  presenceSessionEnd,
  NO_SHIFT_LIMIT,
} from '@hbcfield/shared';
import { CLOSE_ENTRY_INCLUDE } from './clock-out-helpers';
import { ShiftCloseBase } from './shift-close.base';

/**
 * The sweeps that close what nobody closed: abandoned shifts, automatic shifts
 * past their end, presence past the workspace's hours.
 */
@Injectable()
export class ShiftCloseSweepService extends ShiftCloseBase {
  /**
   * Close shifts left open with a TEMPORARY clock-out.
   *
   * ⚠️ Why at all: nothing used to close a forgotten shift, and with one open
   * shift per member the next day's clock-in was refused. Why temporary: the
   * member may simply have had no signal — their real clock-out is on its way,
   * and it must win when it arrives (see clockOut), as must their answer to
   * "when did you leave?" (resolveForgotClockOut).
   *
   * Cheap on purpose: two partial indexes over OPEN shifts answer the query,
   * a tick takes at most OPEN_SHIFT_CLOSE.BATCH, and each close is claimed
   * (status = CLOCKED_IN) so a racing clock-out or a second replica cannot
   * both win. The rests and excursions ride in the same read (no query per row).
   */
  async closeAbandonedShifts(now: Date = new Date()) {
    const autoClosed = await this.closeAutoShiftsPastEnd(now);
    const due = await this.prisma.timeEntry.findMany({
      where: {
        status: TimeEntryStatus.CLOCKED_IN,
        OR: [
          { expectedClockOutAt: { lte: new Date(now.getTime() - OPEN_SHIFT_CLOSE.AFTER_SHIFT_END_HOURS * 3_600_000) } },
          {
            expectedClockOutAt: null,
            clockInAt: { lte: new Date(now.getTime() - OPEN_SHIFT_CLOSE.UNPLANNED_AFTER_HOURS * 3_600_000) },
          },
        ],
      },
      orderBy: { clockInAt: 'asc' },
      take: OPEN_SHIFT_CLOSE.BATCH,
      include: {
        ...CLOSE_ENTRY_INCLUDE,
        // Named in the member's email, so they can tell which shift is meant; its hours are the no-shift fallback.
        location: { select: { name: true, noShiftDailyMinutes: true } },
      },
    });

    let closed = autoClosed;
    for (const entry of due) {
      if (!isAbandoned(entry, now)) continue;
      if (await this.closeProvisionally(entry, now)) closed++;
    }
    if (closed) this.logger.log(`Closed ${closed} abandoned shift(s) with a temporary clock-out`);
    return success({ closed });
  }

  /**
   * The automatic clock's "nobody answered": a member it is on for, still
   * clocked in `closeAfterMinutes` past the planned end, is closed with the
   * SAME temporary clock-out as an abandoned shift (`closeProvisionally`) — so
   * the phone's own automatic clock-out, arriving later with the moment they
   * really left, replaces it exactly as any real clock-out does.
   *
   * Two cheap reads: the open shifts at workspaces that have settings at all,
   * past the SHORTEST threshold the settings allow (narrow columns), then the
   * full rows of only those actually due — never a full row per candidate.
   */
  private async closeAutoShiftsPastEnd(now: Date): Promise<number> {
    if (!this.autoClock) return 0;
    const candidates = await this.prisma.timeEntry.findMany({
      where: {
        status: TimeEntryStatus.CLOCKED_IN,
        expectedClockOutAt: { lte: new Date(now.getTime() - AUTO_CLOCK_LIMITS.closeAfterMinutes[0] * 60_000) },
        location: { autoClock: { not: Prisma.DbNull } },
      },
      orderBy: { expectedClockOutAt: 'asc' },
      take: OPEN_SHIFT_CLOSE.BATCH * 5,
      select: { id: true, userId: true, locationId: true, clockInAt: true, expectedClockOutAt: true },
    });
    if (!candidates.length) return this.closePresencePastHours(now);
    const settings = await this.autoClock.settingsForEntries(candidates, now);
    const dueIds = candidates
      .filter((c) => {
        const s = settings.get(c.id);
        return (
          !!s &&
          !!c.expectedClockOutAt &&
          now.getTime() - c.expectedClockOutAt.getTime() >= s.closeAfterMinutes * 60_000
        );
      })
      .slice(0, OPEN_SHIFT_CLOSE.BATCH)
      .map((c) => c.id);
    let closed = 0;
    if (dueIds.length) {
      const due = await this.prisma.timeEntry.findMany({
        where: { id: { in: dueIds }, status: TimeEntryStatus.CLOCKED_IN },
        include: { ...CLOSE_ENTRY_INCLUDE, location: { select: { name: true, noShiftDailyMinutes: true } } },
      });
      for (const entry of due) if (await this.closeProvisionally(entry, now)) closed++;
    }
    return closed + (await this.closePresencePastHours(now));
  }

  /**
   * The same for a member clocked by ARRIVING AND LEAVING with no shift: past
   * the workspace's hours (read now — a change on the workspace applies at once)
   * + `closeAfterMinutes`, and only with evidence they are gone (`presenceCloseDue`).
   * Ends at when they left, else the last moment the phone saw them on site.
   * Same two cheap reads as above, bounded by the batch.
   */
  private async closePresencePastHours(now: Date): Promise<number> {
    if (!this.autoClock) return 0;
    const shortest = (NO_SHIFT_LIMIT.MIN_MINUTES + AUTO_CLOCK_LIMITS.closeAfterMinutes[0]) * 60_000;
    const candidates = await this.prisma.timeEntry.findMany({
      where: {
        status: TimeEntryStatus.CLOCKED_IN,
        expectedClockOutAt: null,
        expectedClockInAt: null,
        clockInAt: { lte: new Date(now.getTime() - shortest) },
        location: { autoClock: { not: Prisma.DbNull } },
      },
      orderBy: { clockInAt: 'asc' },
      take: OPEN_SHIFT_CLOSE.BATCH * 5,
      select: { id: true, userId: true, locationId: true, clockInAt: true, expectedClockInAt: true },
    });
    if (!candidates.length) return 0;
    const settings = await this.autoClock.settingsForEntries(candidates, now);
    const presenceIds = candidates
      .filter((c) => {
        const s = settings.get(c.id);
        return (
          !!s &&
          clocksByPresence(s, c) &&
          now.getTime() >= presenceSessionEnd(c.clockInAt, s).getTime() + s.closeAfterMinutes * 60_000
        );
      })
      .slice(0, OPEN_SHIFT_CLOSE.BATCH)
      .map((c) => c.id);
    if (!presenceIds.length) return 0;
    const rows = await this.prisma.timeEntry.findMany({
      where: { id: { in: presenceIds }, status: TimeEntryStatus.CLOCKED_IN },
      include: { ...CLOSE_ENTRY_INCLUDE, location: { select: { name: true, noShiftDailyMinutes: true } } },
    });
    let closed = 0;
    for (const entry of rows) {
      const s = settings.get(entry.id)!;
      const verdict = presenceCloseDue({
        clockInAt: entry.clockInAt,
        settings: s,
        now,
        leftSiteAt: entry.geofenceExcursions[0]?.leftRingAt ?? null,
        lastSeenAt: entry.lastSeenAt ?? null,
        presence: entry.presence ?? null,
      });
      if (verdict.due && (await this.closeProvisionally(entry, now, { lastSeenOnSiteAt: verdict.lastSeenOnSiteAt })))
        closed++;
    }
    return closed;
  }
}
