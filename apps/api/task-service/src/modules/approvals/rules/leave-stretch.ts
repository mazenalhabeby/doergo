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

/** The rest-gap test read from the person's own calendar — an unreadable calendar joins nothing. */
export function restGapOf(calendar: LeaveCalendar, organizationId: string, userId: string): RestGap {
  return async (from, to) => {
    const count = await calendar
      .countLeaveFor(organizationId, userId, toISODateString(from), toISODateString(to))
      .catch(() => null);
    return count !== null && count.counted === 0;
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

/** The other leave a stretch may join: waiting or approved, ±90 days, never the request itself. */
export function stretchWhere(technicianIds: string[], from: Date, to: Date) {
  return {
    technicianId: { in: technicianIds },
    ...ABSENCE_WHERE,
    status: { in: ['PENDING' as const, 'APPROVED' as const] },
    startDate: { lte: new Date(to.getTime() + 90 * DAY) },
    endDate: { gte: new Date(from.getTime() - 90 * DAY) },
  };
}

/** The stretch's working days from leave already read (the batch path: one query for many requests). */
export async function stretchFrom(row: StretchRow, ownDays: number, others: Other[], rest: RestGap): Promise<number> {
  if (!isAbsence(row.kind)) return ownDays;
  let [from, to, days] = [row.startDate, row.endDate, ownDays];
  const left = [...others];
  for (let grew = true; grew;) {
    grew = false;
    for (const o of [...left]) {
      if (!((await touches(o.endDate, from, rest)) || (await touches(to, o.startDate, rest)))) continue;
      left.splice(left.indexOf(o), 1);
      days += o.workingDays ?? Math.round((o.endDate.getTime() - o.startDate.getTime()) / DAY) + 1;
      if (o.startDate < from) from = o.startDate;
      if (o.endDate > to) to = o.endDate;
      grew = true;
    }
  }
  return days;
}

/** The working days of the whole stretch of one request — one query (`stretchFrom` for a batch). */
export async function stretchWorkingDays(
  prisma: StretchPrisma,
  row: StretchRow,
  ownDays: number,
  rest: RestGap,
): Promise<number> {
  if (!isAbsence(row.kind)) return ownDays;
  const others = await prisma.timeOff.findMany({
    where: { ...stretchWhere([row.technicianId], row.startDate, row.endDate), id: { not: row.id } },
    select: { startDate: true, endDate: true, workingDays: true },
  });
  return stretchFrom(row, ownDays, others, rest);
}
