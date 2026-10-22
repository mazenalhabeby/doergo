import { Injectable, NotFoundException } from '@nestjs/common';
import { zoneOf, success, personPasses } from '@hbcfield/shared';
import { assertNotSelfDecision } from './self-decision';
import { zonedWallTimeToUtc as sharedZonedWallTimeToUtc, localPartsIn, parseHm } from '@hbcfield/shared';
import { scopeAllows } from '@hbcfield/shared';
import { EntryServiceBase } from './entry-service.base';
import {
  assertManualRangeShape,
  manualBreakPlacement,
  manualEntryRow,
  type ManualEntryRow,
  manualTargetDates,
  type ManualEntriesInput,
} from './manual-entries-steps';

/** Hours the office adds by hand ("they were here") — one person or several, one day or many. */
@Injectable()
export class ManualEntriesService extends EntryServiceBase {
  /**
   * Admin: manually add (back-date) attendance for an employee.
   * Generates one CLOCKED_OUT entry per selected working day in [startDate, endDate],
   * auto-approved and geofence-exempt (no GPS needed for historical data).
   * Skips days that already have an entry for that employee (safe to re-run).
   */
  async addManualEntries(data: ManualEntriesInput) {
    const [user, loc] = await Promise.all([
      personPasses(this.prisma, data.userId, { organizationId: data.organizationId }),
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
    assertManualRangeShape(data);

    const { breakOffsetMin, breakMin } = manualBreakPlacement(data);

    const tz = zoneOf(loc.timezone);
    const reason = data.reason?.trim() || 'Manually added by admin';
    const dates = manualTargetDates(data);

    // Wall time in the site's zone → UTC, through the shared two-pass rule
    // (attendance/zoned-time). The private copy this replaces read the offset
    // ONCE, at a naive guess, so on a daylight-saving day a back-filled 06:00
    // landed at 05:00 or 07:00 — exactly the night-shift days it matters.
    const zonedWallTimeToUtc = (dateStr: string, timeStr: string): Date => {
      const [h, m] = parseHm(timeStr);
      return sharedZonedWallTimeToUtc(dateStr, h, m, tz);
    };
    const utcToZonedYmd = (date: Date): string => localPartsIn(date, tz).dateStr;

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
    const toCreate: ManualEntryRow[] = [];
    let skipped = 0;
    for (const ymd of dates) {
      if (taken.has(ymd)) {
        skipped++;
        continue;
      }
      const clockIn = zonedWallTimeToUtc(ymd, data.startTime);
      const clockOut = zonedWallTimeToUtc(ymd, data.endTime);
      toCreate.push(manualEntryRow(data, { ymd, clockIn, clockOut, now, tz, loc, breakMin, reason }));
    }

    if (toCreate.length) {
      await this.writeManualEntries(data, toCreate, { breakOffsetMin, breakMin, reason });
    }

    this.logger.log(
      `Manual attendance added: user=${data.userId}, editor=${data.editorId}, created=${toCreate.length}, skipped=${skipped}`,
    );
    if (toCreate.length) {
      this.emitChanged(data.organizationId, 'manual-add');
      const from = toCreate.reduce((m, e) => (e.clockInAt < m ? e.clockInAt : m), toCreate[0].clockInAt as Date);
      const to = toCreate.reduce((m, e) => (e.clockOutAt > m ? e.clockOutAt : m), toCreate[0].clockOutAt as Date);
      await this.noShowSettle
        ?.settleForUser(data.userId, from, to)
        .catch((e) => this.logger.warn(`No-show settle after manual add failed: ${(e as Error).message}`));
    }
    return success(
      { created: toCreate.length, skipped },
      `Added ${toCreate.length} ${toCreate.length === 1 ? 'entry' : 'entries'}` +
        (skipped ? ` (skipped ${skipped} — already recorded)` : ''),
    );
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
  private async writeManualEntries(
    data: ManualEntriesInput,
    toCreate: ManualEntryRow[],
    rest: { breakOffsetMin: number; breakMin: number; reason: string },
  ) {
    const { breakOffsetMin, breakMin, reason } = rest;
    if (breakMin <= 0) {
      await this.prisma.timeEntry.createMany({ data: toCreate });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      for (const entry of toCreate) {
        const created = await tx.timeEntry.create({
          data: entry,
          select: { id: true, clockInAt: true, clockOutAt: true },
        });
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
  }
}
