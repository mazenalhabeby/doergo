import { ConflictException } from '@nestjs/common';
import { TimeEntryStatus, type PrismaService } from '@hbcfield/shared';
import type { ShiftCloser } from '../clock-out/shift-closer.service';
import { CLOSE_ENTRY_INCLUDE } from '../clock-out/clock-out-helpers';
import { appendNote } from '../clock-out/clock-out-steps';
import { forgottenEnd } from '../core/hand-edit-review';
import { closeByOffice } from './office-close';

/** What the closed shift says about why it closed — the office reads it in the timesheet. */
export const LEAVER_CLOSE_NOTE = 'Closed by the office: the member left the organization';

/**
 * Where a leaver's open shift ends: where the office would close a forgotten one (`forgottenEnd` — the planned end,
 * the last moment seen, now: the earliest), never before the clock-in or a rest already taken. A daily-limit marker
 * is not an end (B5).
 */
export function leaverCloseAt(
  entry: {
    clockInAt: Date;
    expectedClockOutAt?: Date | null;
    endIsDailyLimit?: boolean | null;
    lastSeenAt?: Date | null;
    breaks?: { startedAt: Date; endedAt: Date | null }[];
  },
  now: Date,
): Date {
  const planned = entry.endIsDailyLimit ? null : (entry.expectedClockOutAt ?? null);
  const end = forgottenEnd({ expectedClockOutAt: planned, lastSeenAt: entry.lastSeenAt ?? null }, now);
  const floor = Math.max(
    entry.clockInAt.getTime(),
    ...(entry.breaks ?? []).map((b) => (b.endedAt ?? b.startedAt).getTime()),
  );
  return new Date(Math.min(Math.max(end.getTime(), floor), now.getTime()));
}

/**
 * Somebody leaves the organization (removed, account deleted, switched off) with a shift still running: it closes
 * now through THE office close (`closeByOffice` → `ShiftCloser.closeEntry`) — a running rest ends with it, the jobs
 * pause, the clock-out is announced — and waits for a glance (PENDING, MISSED_CLOCK_OUT). Left open it went on
 * counting for somebody who could no longer sign in to clock out, and reminded leaders about them every day.
 *
 * Idempotent: a shift closed meanwhile (the member's own clock-out won) is skipped, not an error.
 */
export async function closeShiftsOfLeaver(
  closer: ShiftCloser,
  prisma: PrismaService,
  who: { organizationId: string; userId: string },
  now: Date = new Date(),
): Promise<number> {
  const open = await prisma.timeEntry.findMany({
    where: { userId: who.userId, organizationId: who.organizationId, status: TimeEntryStatus.CLOCKED_IN },
    include: CLOSE_ENTRY_INCLUDE,
  });
  let closed = 0;
  for (const entry of open) {
    const flags = [...new Set([...(entry.flagReasons ?? []), 'MISSED_CLOCK_OUT'])];
    try {
      await closeByOffice(
        closer,
        prisma,
        { ...entry, locationId: entry.locationId ?? undefined },
        { notes: appendNote(entry.notes, LEAVER_CLOSE_NOTE), flagReasons: flags, approvalStatus: 'PENDING' },
        { at: leaverCloseAt(entry, now), include: {} },
      );
      closed++;
    } catch (e) {
      if (!(e instanceof ConflictException)) throw e; // closed meanwhile — nothing left to do
    }
  }
  return closed;
}
