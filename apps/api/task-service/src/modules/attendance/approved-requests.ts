import {
  applyApprovedRequests,
  localPartsIn,
  parseHm,
  toISODateString,
  zonedWallTimeToUtc,
  type ApprovedDayRequest,
  type DayRequestEffect,
} from '@hbcfield/shared';

/*
  A member's APPROVED requests that shape a day of attendance (requests/request-kinds.ts):
  a remote day, changed hours, overtime agreed in advance. Leave is not here — leave is an
  absence, and a clock-in on a day of leave is a different question.

  ONE indexed read (technicianId, status, startDate) per clock-in, over a window one day either
  side of the instant, so the same rows answer "today" in whatever zone the workspace is in.
  The rule for what they change is the shared `applyApprovedRequests`; this file only owns the
  zone arithmetic, through the existing zone helpers.
*/

const SHAPING_KINDS = ['REMOTE', 'HOURS', 'OVERTIME'] as const;
const DAY_MS = 86_400_000;

export interface DayRequestRow extends ApprovedDayRequest {
  startDate: Date;
  endDate: Date;
}

interface TimeOffReader {
  timeOff: { findMany(args: unknown): Promise<unknown[]> };
}

/** The approved remote/hours/overtime requests that could touch the local day of `at` anywhere on Earth. */
export async function approvedRequestsAround(
  prisma: TimeOffReader,
  userId: string,
  at: Date,
  kinds: readonly string[] = SHAPING_KINDS,
): Promise<DayRequestRow[]> {
  const rows = await prisma.timeOff.findMany({
    where: {
      technicianId: userId,
      status: 'APPROVED',
      kind: { in: [...kinds] },
      startDate: { lte: new Date(`${toISODateString(new Date(at.getTime() + DAY_MS))}T00:00:00.000Z`) },
      endDate: { gte: new Date(`${toISODateString(new Date(at.getTime() - DAY_MS))}T00:00:00.000Z`) },
    },
    select: { id: true, kind: true, spaceId: true, startTime: true, endTime: true, minutes: true, startDate: true, endDate: true },
  });
  return rows as DayRequestRow[];
}

/** The requests covering the local date of `at` in `tz` (DATE columns read as their UTC day). */
export function requestsOnLocalDay(rows: readonly DayRequestRow[], at: Date, tz: string): { dateKey: string; rows: DayRequestRow[] } {
  const dateKey = localPartsIn(at, tz).dateStr;
  return {
    dateKey,
    rows: rows.filter((r) => toISODateString(r.startDate) <= dateKey && toISODateString(r.endDate) >= dateKey),
  };
}

/** Is a remote day approved at this workspace on the local date of `at`? */
export function remoteApprovedAt(rows: readonly DayRequestRow[], spaceId: string, at: Date, tz: string): boolean {
  return requestsOnLocalDay(rows, at, tz).rows.some((r) => r.kind === 'REMOTE' && r.spaceId === spaceId);
}

/** What the day's approved requests change about a clock-in at `spaceId` (shared rule, local zone here). */
export function dayRequestEffect(
  rows: readonly DayRequestRow[],
  input: { spaceId: string | null; at: Date; tz: string; expectedClockInAt: Date | null; expectedClockOutAt: Date | null },
): DayRequestEffect {
  const { dateKey, rows: today } = requestsOnLocalDay(rows, input.at, input.tz);
  return applyApprovedRequests({
    spaceId: input.spaceId,
    expectedClockInAt: input.expectedClockInAt,
    expectedClockOutAt: input.expectedClockOutAt,
    requests: today,
    atLocal: (hhmm) => {
      const [h, m] = parseHm(hhmm);
      return zonedWallTimeToUtc(dateKey, h, m, input.tz);
    },
  });
}
