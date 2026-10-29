import { isAbandoned } from '../core/open-shift-close';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  success,
  TimeEntryStatus,
  OPEN_SHIFT_CLOSE,
  clocksByPresence,
  presenceCloseDue,
  presenceSessionEnd,
  seenOnSiteRecently,
} from '@hbcfield/shared';
import { autoShiftsPastEnd, presencePastHours } from './auto-close-candidates';
import { CLOSE_ENTRY_INCLUDE } from './clock-out-helpers';
import { PrismaService } from '@hbcfield/shared';
import { AutoClockService } from '../auto-clock/auto-clock.service';
import { ShiftCloser } from './shift-closer.service';

/**
 * The sweeps that close what nobody closed: abandoned shifts, automatic shifts
 * past their end, presence past the workspace's hours.
 */
@Injectable()
export class ShiftCloseSweepService {
  private readonly logger = new Logger(ShiftCloseSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly closer: ShiftCloser,
    // Absent, nothing is automatic: only the abandoned-shift close runs.
    @Optional() private readonly autoClock?: AutoClockService,
  ) {}

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
      if (await this.closer.closeProvisionally(entry, now)) closed++;
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
   * ⚠️ Not somebody the phone still reports ON SITE (`seenOnSiteRecently`):
   * they are there, the leader has been told, and a shift truly forgotten is the
   * abandoned-shift close's. Only rows already eligible are read
   * (`auto-close-candidates.ts`), so rows never due cannot starve the due ones.
   */
  private async closeAutoShiftsPastEnd(now: Date): Promise<number> {
    if (!this.autoClock) return 0;
    const candidates = await autoShiftsPastEnd(this.prisma, now);
    let closed = 0;
    if (candidates.length) {
      const settings = await this.autoClock.settingsForEntries(candidates, now);
      const dueIds = candidates
        .filter((c) => {
          const s = settings.get(c.id);
          return (
            !!s && !!c.expectedClockOutAt && now.getTime() - c.expectedClockOutAt.getTime() >= s.closeAfterMinutes * 60_000
          );
        })
        .map((c) => c.id);
      const due = dueIds.length
        ? await this.prisma.timeEntry.findMany({
            where: { id: { in: dueIds }, status: TimeEntryStatus.CLOCKED_IN },
            include: { ...CLOSE_ENTRY_INCLUDE, location: { select: { name: true, noShiftDailyMinutes: true } } },
          })
        : [];
      for (const entry of due) {
        if (seenOnSiteRecently(entry, settings.get(entry.id)!, now)) continue;
        if (await this.closer.closeProvisionally(entry, now)) closed++;
      }
    }
    return closed + (await this.closePresencePastHours(now));
  }

  /**
   * The same for a member clocked by ARRIVING AND LEAVING with no shift — free,
   * or up to a number of hours a day (LIMIT, whose end is only the marker):
   * past their hours (their own, else the workspace's, read now — a change
   * applies at once) + `closeAfterMinutes`, and only with evidence they are gone
   * (`presenceCloseDue`). Ends at when they left — seen leaving, else the moment
   * presence moved off site, else the last moment the phone saw them there.
   */
  private async closePresencePastHours(now: Date): Promise<number> {
    if (!this.autoClock) return 0;
    const candidates = await presencePastHours(this.prisma, now);
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
        presenceAt: entry.presenceAt ?? null,
      });
      if (
        verdict.due &&
        (await this.closer.closeProvisionally(entry, now, { lastSeenOnSiteAt: verdict.lastSeenOnSiteAt }))
      )
        closed++;
    }
    return closed;
  }
}
