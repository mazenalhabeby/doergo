import { ABSENCE_WHERE, isAbsence, toISODateString } from '@hbcfield/shared';

/*
  The whole STRETCH of leave a request belongs to — its own working days plus every waiting or approved leave it
  touches (back to back, or with only days off between: a weekend, a public holiday, a rota rest day). Two 4-day
  requests in a row are an 8-day absence: no way round a "5 working days or more" rule by splitting it.
*/

const DAY = 86_400_000;
/** The longest gap of days off that can still join two requests (a long weekend + holidays). */
const MAX_REST_GAP_DAYS = 7;

/** The calendar's own count of what a range costs this person (weekend, holidays, their rota left out). */
export interface LeaveCalendar {
  countLeaveFor(organizationId: string, userId: string, from: string, to: string): Promise<{ counted: number }>;
}

/** Are the days from..to (inclusive) all days off for this person? */
export type RestGap = (from: Date, to: Date) => Promise<boolean>;

/**
 * The rest-gap test read from the person's own calendar — an unreadable calendar joins nothing. Each gap is asked
 * once (cached): a batch of one person's requests shares one answer per gap.
 */
export function restGapOf(calendar: LeaveCalendar, organizationId: string, userId: string): RestGap {
  const asked = new Map<string, Promise<boolean>>();
  return (from, to) => {
    const [a, b] = [toISODateString(from), toISODateString(to)];
    const key = `${a}|${b}`;
    if (!asked.has(key))
      asked.set(
        key,
        calendar
          .countLeaveFor(organizationId, userId, a, b)
          .then((c) => c.counted === 0)
          .catch(() => false),
      );
    return asked.get(key)!;
  };
}

/** Two ranges touch when the next starts the day after, or only days off lie between. */
async function touches(end: Date, start: Date, rest: RestGap): Promise<boolean> {
  const gap = Math.round((start.getTime() - end.getTime()) / DAY);
  if (gap <= 0 || gap > MAX_REST_GAP_DAYS + 1) return false;
  if (gap === 1) return true;
  return rest(new Date(end.getTime() + DAY), new Date(start.getTime() - DAY));
}

export interface StretchRow {
  id: string;
  technicianId: string;
  kind: string;
  startDate: Date;
  endDate: Date;
}
type Other = { startDate: Date; endDate: Date; workingDays: number | null };
export interface StretchPrisma {
  timeOff: { findMany(args: unknown): Promise<Array<Other & { id?: string; technicianId?: string }>> };
}

/** The other leave a stretch may join: waiting or approved, ±90 days (the request itself is skipped by id). */
export function stretchWhere(technicianIds: string[], from: Date, to: Date) {
  return {
    technicianId: { in: technicianIds },
    ...ABSENCE_WHERE,
    status: { in: ['PENDING' as const, 'APPROVED' as const] },
    startDate: { lte: new Date(to.getTime() + 90 * DAY) },
    endDate: { gte: new Date(from.getTime() - 90 * DAY) },
  };
}

const daysOf = (o: Other) => o.workingDays ?? Math.round((o.endDate.getTime() - o.startDate.getTime()) / DAY) + 1;

/**
 * The stretch's working days from leave already read. Walks outward from the request — the nearest leave before it,
 * then the next, and the same after — so each neighbour is tested ONCE (at most one calendar question per gap).
 */
export async function stretchFrom(row: StretchRow, ownDays: number, others: Other[], rest: RestGap): Promise<number> {
  if (!isAbsence(row.kind)) return ownDays;
  let days = ownDays;
  const before = others.filter((o) => o.endDate < row.startDate).sort((x, y) => +y.endDate - +x.endDate);
  for (let edge = row.startDate, i = 0; i < before.length; i++) {
    if (!(await touches(before[i].endDate, edge, rest))) break;
    days += daysOf(before[i]);
    if (before[i].startDate < edge) edge = before[i].startDate;
  }
  const after = others.filter((o) => o.startDate > row.endDate).sort((x, y) => +x.startDate - +y.startDate);
  for (let edge = row.endDate, i = 0; i < after.length; i++) {
    if (!(await touches(edge, after[i].startDate, rest))) break;
    days += daysOf(after[i]);
    if (after[i].endDate > edge) edge = after[i].endDate;
  }
  return days;
}

/** The working days of the whole stretch of one request — one query (`stretchDaysMany` for a batch). */
export async function stretchWorkingDays(
  prisma: StretchPrisma,
  row: StretchRow,
  ownDays: number,
  rest: RestGap,
): Promise<number> {
  return (await stretchDaysMany(prisma, [{ row, ownDays, rest }])).get(row) ?? ownDays;
}

/**
 * The stretches of many requests at once — ONE query for all of them; the calendar asked once per gap per person
 * (pass the same `rest` for one person's rows). A request in the database is never counted as its own neighbour.
 */
export async function stretchDaysMany(
  prisma: StretchPrisma,
  asks: Array<{ row: StretchRow; ownDays: number; rest: RestGap }>,
): Promise<Map<StretchRow, number>> {
  const out = new Map<StretchRow, number>();
  const leave = asks.filter((a) => isAbsence(a.row.kind));
  for (const a of asks) out.set(a.row, a.ownDays);
  if (!leave.length) return out;
  const from = new Date(Math.min(...leave.map((a) => a.row.startDate.getTime())));
  const to = new Date(Math.max(...leave.map((a) => a.row.endDate.getTime())));
  const others = await prisma.timeOff.findMany({
    where: stretchWhere([...new Set(leave.map((a) => a.row.technicianId))], from, to),
    select: { id: true, technicianId: true, startDate: true, endDate: true, workingDays: true },
  });
  for (const a of leave) {
    const mine = others.filter((o) => o.technicianId === a.row.technicianId && o.id !== a.row.id);
    out.set(a.row, await stretchFrom(a.row, a.ownDays, mine, a.rest));
  }
  return out;
}
