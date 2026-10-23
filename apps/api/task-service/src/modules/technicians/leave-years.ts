import {
  type PrismaService,
  carryExpiryDate,
  countLeave as countLeaveDays,
  isLeaveAdjustmentKind,
  leaveBalance,
  toISODateString,
  type LeaveAdjustmentKind,
  type LeaveBalanceResponse,
  ABSENCE_WHERE,
} from '@hbcfield/shared';
import type { CalendarRulesService } from '../calendar/calendar-rules.service';
import {
  OrgLeave,
  PersonLeave,
  PersonLeaveYear,
  half,
  asDate,
  dayOf,
  carryRuleOf,
  leaveYearFor,
} from './leave-ledger-helpers';

/*
  The balance core of THE LEAVE LEDGER (leave-ledger.service.ts): each person's leave year,
  allowance + adjustments − taken. A fixed number of queries however many people.
*/

export async function leaveYears(
  prisma: PrismaService,
  calendarRules: CalendarRulesService,
  org: OrgLeave,
  people: PersonLeave[],
  onFor: (p: PersonLeave) => string,
): Promise<Map<string, PersonLeaveYear>> {
  const out = new Map<string, PersonLeaveYear>();
  if (!people.length) return out;
  const windows = new Map(people.map((p) => [p.id, leaveYearFor(org, p, onFor(p))]));
  const all = [...windows.values()];
  const minStart = all.reduce((m, w) => (w.start < m ? w.start : m), all[0]!.start);
  const maxEnd = all.reduce((m, w) => (w.end > m ? w.end : m), all[0]!.end);
  const ids = people.map((p) => p.id);
  const starts = [...new Set(all.map((w) => w.start))].map(asDate);

  const [requests, adjustments] = await Promise.all([
    prisma.timeOff.findMany({
      // Leave only, VACATION only: a remote day or a sick day never touches the allowance.
      where: {
        technicianId: { in: ids },
        ...ABSENCE_WHERE,
        type: 'VACATION' as never,
        status: { in: ['APPROVED', 'PENDING'] as never[] },
        startDate: { lte: asDate(maxEnd) },
        endDate: { gte: asDate(minStart) },
      },
      select: { technicianId: true, status: true, startDate: true, endDate: true },
    }),
    prisma.leaveAdjustment.findMany({
      where: { organizationId: org.id, userId: { in: ids }, voidedAt: null, leaveYearStart: { in: starts } },
      select: { userId: true, kind: true, days: true, leaveYearStart: true, sourceKey: true },
    }),
  ]);

  // Calendar rules only for people who have vacation in the window, once for all of them.
  const withLeave = [...new Set(requests.map((r) => r.technicianId))];
  const rules = withLeave.length ? await calendarRules.personRulesMany(org.id, withLeave, minStart, maxEnd) : new Map();
  const fallback = withLeave.some((id) => !rules.has(id))
    ? await calendarRules.personRules(org.id, '', minStart, maxEnd)
    : null;

  const rule = carryRuleOf(org);
  for (const p of people) {
    const ly = windows.get(p.id)!;
    // Null is "use the default"; 0 is a real answer (no paid leave), so `??` not `||`.
    const fullAllowance = p.leaveAllowance ?? org.defaultLeaveAllowance ?? 25;
    let allowance = fullAllowance;
    let prorated = false;
    /*
      A first calendar year is pro-rated by the months actually here, the start month included.
      Only from a RECORDED start date (createdAt would cut months off everybody imported on one
      afternoon). A work year begins on the start date itself, so it is never pro-rated.
    */
    const started = dayOf(p.employmentStartDate);
    if (ly.mode === 'CALENDAR' && started && started >= ly.start && started <= ly.end) {
      const monthsHere = 13 - Number(started.slice(5, 7));
      allowance = half((fullAllowance * monthsHere) / 12);
      prorated = true;
    }

    const mine = requests.filter((r) => r.technicianId === p.id);
    const r = rules.get(p.id) ?? fallback;
    const clipped = mine.map((q) => {
      const from = toISODateString(q.startDate),
        to = toISODateString(q.endDate);
      return { status: q.status as string, from: from < ly.start ? ly.start : from, to: to > ly.end ? ly.end : to };
    });
    const cost = (from: string, to: string) => (r ? countLeaveDays(from, to, r.rules, r.roster).counted : 0);
    let taken = 0,
      pending = 0;
    for (const c of clipped) {
      if (c.status === 'APPROVED') taken += cost(c.from, c.to);
      else pending += cost(c.from, c.to);
    }
    const adj = adjustments
      .filter(
        (a) => a.userId === p.id && toISODateString(a.leaveYearStart) === ly.start && isLeaveAdjustmentKind(a.kind),
      )
      .map((a) => ({ kind: a.kind as LeaveAdjustmentKind, days: a.days, sourceKey: a.sourceKey }));
    const balance = leaveBalance({ allowance, adjustments: adj, taken, pending });
    const carried = adj.some((a) => a.kind === 'CARRY_OVER' && a.days > 0);
    out.set(p.id, {
      userId: p.id,
      leaveYear: ly,
      allowance,
      fullAllowance,
      prorated,
      startedOn: prorated ? started : null,
      adjustments: adj,
      balance,
      carryExpiresOn: carried ? carryExpiryDate(ly, rule) : null,
      takenUpTo: (day) =>
        clipped
          .filter((c) => c.status === 'APPROVED' && c.from <= day)
          .reduce((s, c) => s + cost(c.from, c.to > day ? day : c.to), 0),
    });
  }
  return out;
}

/** The response every client reads — the old fields first, so a phone from before keeps working. */
export function leaveBalanceResponse(y: PersonLeaveYear): LeaveBalanceResponse {
  return {
    year: Number(y.leaveYear.start.slice(0, 4)),
    allowance: y.balance.allowance,
    taken: y.balance.taken,
    pending: y.balance.pending,
    remaining: y.balance.remaining,
    prorated: y.prorated,
    fullAllowance: y.fullAllowance,
    startedOn: y.startedOn,
    leaveYear: y.leaveYear,
    adjusted: y.balance.adjusted,
    lines: y.balance.lines,
    carryExpiresOn: y.carryExpiresOn,
  };
}
