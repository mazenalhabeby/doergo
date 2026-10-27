import { isAbsence, notEndedWhere, type RuleFacts } from '@hbcfield/shared';

/**
 * A leave / request item as office rules read it — ONE builder for the approve path (time-off-decision), the
 * "nobody answers" sweep and the rules page, so they can never read a request two ways. The workspaces are the
 * request's own, else the member's CURRENT ones; the days are the counted working days.
 */
export const REQUEST_RULE_SELECT = {
  id: true,
  technicianId: true,
  startDate: true,
  endDate: true,
  workingDays: true,
  kind: true,
  spaceId: true,
  technician: { select: { spaceAssignments: { where: notEndedWhere(), select: { spaceId: true } } } },
} as const;

export interface RequestRuleRow {
  id: string;
  technicianId: string;
  startDate: Date;
  endDate: Date;
  workingDays: number | null;
  kind: string;
  spaceId: string | null;
  technician: { spaceAssignments: { spaceId: string }[] };
}

export function requestRuleFacts(t: RequestRuleRow, coverShort: boolean, workingDays?: number | null): RuleFacts {
  return {
    spaceIds: t.spaceId ? [t.spaceId] : t.technician.spaceAssignments.map((a) => a.spaceId),
    days: workingDays ?? t.workingDays ?? Math.round((t.endDate.getTime() - t.startDate.getTime()) / 86_400_000) + 1,
    coverShort,
  };
}

/** Would people be short — the wallchart's own verdict (CoverService), for leave only, in ONE batch. */
export async function requestsCoverShort(
  cover: {
    assessMany(
      org: string,
      rows: Array<{ id: string; technicianId: string; startDate: Date; endDate: Date }>,
    ): Promise<Map<string, unknown>>;
  },
  organizationId: string,
  rows: RequestRuleRow[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const leave = rows.filter((r) => isAbsence(r.kind));
  if (!leave.length) return out;
  try {
    const verdicts = await cover.assessMany(
      organizationId,
      leave.map((r) => ({ id: r.id, technicianId: r.technicianId, startDate: r.startDate, endDate: r.endDate })),
    );
    for (const [id, v] of verdicts) {
      const level = (v as { level?: string } | null)?.level;
      out.set(id, level === 'short' || level === 'skill');
    }
  } catch {
    // Unreadable cover: a cover-only rule does not fire, rather than firing on a guess.
  }
  return out;
}

const DAY = 86_400_000;

/** Two ranges touch when nothing but a weekend lies between them (Fri → Mon is one stretch of leave). */
function touches(end: Date, start: Date): boolean {
  const gap = start.getTime() - end.getTime();
  if (gap <= 0 || gap > 4 * DAY) return false;
  for (let d = end.getTime() + DAY; d < start.getTime(); d += DAY) {
    const dow = new Date(d).getUTCDay();
    if (dow !== 0 && dow !== 6) return false;
  }
  return true;
}

/**
 * The working days of the WHOLE stretch of leave a request belongs to: its own, plus every other waiting or approved
 * request of the same kind it touches (back to back, or with only a weekend between). Two 4-day requests in a row are
 * an 8-day absence — no way round a "5 working days or more" rule. One query.
 */
export async function stretchWorkingDays(
  prisma: {
    timeOff: {
      findMany(args: unknown): Promise<Array<{ startDate: Date; endDate: Date; workingDays: number | null }>>;
    };
  },
  row: RequestRuleRow,
  ownDays: number,
): Promise<number> {
  if (!isAbsence(row.kind)) return ownDays;
  const others = await prisma.timeOff.findMany({
    where: {
      technicianId: row.technicianId,
      kind: row.kind,
      id: { not: row.id },
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: new Date(row.endDate.getTime() + 90 * DAY) },
      endDate: { gte: new Date(row.startDate.getTime() - 90 * DAY) },
    },
    select: { startDate: true, endDate: true, workingDays: true },
  });
  let [from, to, days] = [row.startDate, row.endDate, ownDays];
  const left = [...others];
  for (let grew = true; grew;) {
    grew = false;
    for (const o of [...left]) {
      if (!(touches(o.endDate, from) || touches(to, o.startDate))) continue;
      left.splice(left.indexOf(o), 1);
      days += o.workingDays ?? Math.round((o.endDate.getTime() - o.startDate.getTime()) / DAY) + 1;
      if (o.startDate < from) from = o.startDate;
      if (o.endDate > to) to = o.endDate;
      grew = true;
    }
  }
  return days;
}

/**
 * A request's facts for the approve path: the working days of the whole stretch of leave it belongs to
 * (`stretchWorkingDays`), and cover worked out only when a rule of the organization asks about it (asking costs four
 * reads of the wallchart). ONE call for approving, recording and re-dating leave.
 */
export async function requestFactsFor(
  rules: { asksAboutCover(organizationId: string): Promise<boolean> },
  cover: Parameters<typeof requestsCoverShort>[0],
  organizationId: string,
  row: RequestRuleRow,
  workingDays: number | null | undefined,
  prisma: Parameters<typeof stretchWorkingDays>[0],
): Promise<RuleFacts> {
  const coverShort =
    (await rules.asksAboutCover(organizationId)) &&
    ((await requestsCoverShort(cover, organizationId, [row])).get(row.id) ?? false);
  const own = requestRuleFacts(row, coverShort, workingDays);
  return { ...own, days: await stretchWorkingDays(prisma, row, own.days ?? 0) };
}
