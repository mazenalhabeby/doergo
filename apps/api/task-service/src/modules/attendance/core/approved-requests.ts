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
    select: {
      id: true,
      kind: true,
      spaceId: true,
      startTime: true,
      endTime: true,
      minutes: true,
      startDate: true,
      endDate: true,
      approvedAt: true,
    },
    // Deterministic; the shared rule (`requestApplyOrder`) decides which answer wins.
    orderBy: [{ approvedAt: 'asc' }, { id: 'asc' }],
  });
  return rows as DayRequestRow[];
}

/** The requests covering the local date of `at` in `tz` (DATE columns read as their UTC day). */
export function requestsOnLocalDay(
  rows: readonly DayRequestRow[],
  at: Date,
  tz: string,
): { dateKey: string; rows: DayRequestRow[] } {
  const dateKey = localPartsIn(at, tz).dateStr;
  return {
    dateKey,
    rows: rows.filter((r) => toISODateString(r.startDate) <= dateKey && toISODateString(r.endDate) >= dateKey),
  };
}

/**
 * Overtime agreed in advance for the local day of `at`, at this workspace (a request with no
 * workspace counts everywhere). It raises a no-shift day's limit (`noShiftAllowance` extraMinutes).
 */
export function agreedOvertimeMinutes(
  rows: readonly DayRequestRow[],
  spaceId: string | null,
  at: Date,
  tz: string,
): number {
  return requestsOnLocalDay(rows, at, tz)
    .rows.filter((r) => r.kind === 'OVERTIME' && (!r.spaceId || !spaceId || r.spaceId === spaceId))
    .reduce((sum, r) => sum + (r.minutes ?? 0), 0);
}

/** Is a remote day approved at this workspace on the local date of `at`? */
export function remoteApprovedAt(rows: readonly DayRequestRow[], spaceId: string, at: Date, tz: string): boolean {
  return requestsOnLocalDay(rows, at, tz).rows.some((r) => r.kind === 'REMOTE' && r.spaceId === spaceId);
}

const nextDayKey = (key: string) => toISODateString(new Date(Date.parse(`${key}T00:00:00.000Z`) + DAY_MS));
const prevDayKey = (key: string) => toISODateString(new Date(Date.parse(`${key}T00:00:00.000Z`) - DAY_MS));

/**
 * The day whose NIGHT `at` falls in: changed hours that end at or before they start (22:00–06:00)
 * run into the next morning, and a clock-in at 00:30 inside them belongs to the day the night
 * STARTED (requests/request-kinds.ts). Null when `at` is in no such night.
 */
export function nightRequestDay(rows: readonly DayRequestRow[], at: Date, tz: string, spaceId?: string | null): string | null {
  const today = localPartsIn(at, tz).dateStr;
  const yesterday = prevDayKey(today);
  const night = requestsOnLocalDay(rows, zonedWallTimeToUtc(yesterday, 12, 0, tz), tz).rows.some((r) => {
    if (r.kind !== 'HOURS' || !r.startTime || !r.endTime || r.endTime > r.startTime) return false;
    if (r.spaceId && spaceId && r.spaceId !== spaceId) return false;
    const [h, m] = parseHm(r.endTime);
    return at.getTime() < zonedWallTimeToUtc(today, h, m, tz).getTime();
  });
  return night ? yesterday : null;
}

/** What the day's approved requests change about a clock-in at `spaceId` (shared rule, local zone here). */
export function dayRequestEffect(
  rows: readonly DayRequestRow[],
  input: {
    spaceId: string | null;
    at: Date;
    tz: string;
    expectedClockInAt: Date | null;
    expectedClockOutAt: Date | null;
  },
): DayRequestEffect {
  // ⚠️ After midnight inside last night's changed hours: last night's requests, not today's.
  const night = nightRequestDay(rows, input.at, input.tz, input.spaceId);
  const dateKey = night ?? localPartsIn(input.at, input.tz).dateStr;
  const today = rows.filter((r) => toISODateString(r.startDate) <= dateKey && toISODateString(r.endDate) >= dateKey);
  return applyApprovedRequests({
    spaceId: input.spaceId,
    expectedClockInAt: input.expectedClockInAt,
    expectedClockOutAt: input.expectedClockOutAt,
    requests: today,
    atLocal: (hhmm, nextDay) => {
      const [h, m] = parseHm(hhmm);
      return zonedWallTimeToUtc(nextDay ? nextDayKey(dateKey) : dateKey, h, m, input.tz);
    },
  });
}
