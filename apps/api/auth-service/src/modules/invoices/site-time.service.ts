import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  personName,
  loadRateBook,
  dayKeyIn,
  parseDayKey,
  billsHours,
  billsDays,
  type BillByValue,
  type DayEntry,
  type HoursEntry,
  effectiveHoursBasis,
  shiftLengthMinutes,
  labourCost,
  toISODateString,
} from '@hbcfield/shared';
import { FINISHED, countedMinutesByDay, minutesByDay } from './work-source';

/**
 * A workspace's site time for an invoice: who worked here in the period, their
 * counted hours and the days they worked, priced on each day's rate. Used by
 * `InvoiceGatherService.gather`.
 */
@Injectable()
export class SiteTimeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * TIME ON SITE at a workspace, per person: HOURS runs (everybody billed by
   * the hour or hour + day) and DAY runs (people with a trade billed by the day
   * or hour + day), each priced on its own day.
   *
   * ⚠️ HOURS ARE THE TIME THEY WERE THERE — the counted time of their clock-ins
   * at this workspace; a day with a finished job and no clock-in counts that
   * job's time (`countedMinutesByDay`, shared with the statement and margin).
   *
   * ⚠️ A DAY WORKED is any day with a clock-in (not REJECTED) or a finished job
   * there, in the workspace's zone, once per day.
   *
   * ⚠️ NEVER BILLED TWICE. Every HOURS and DAYS line on a live invoice records
   * whose time and which run (`workerId`, `dayFrom`–`dayTo`); those days are
   * skipped for that kind. Cancelling or deleting the invoice releases them.
   *
   * Three queries for the whole workspace, whatever its size.
   */
  async gatherSiteTime(args: {
    organizationId: string;
    spaceId: string;
    tz: string;
    from?: string;
    to?: string;
    assignments: Array<{
      id: string;
      userId: string;
      hoursBasis?: string | null;
      workRole: { id: string; name: string; kind: string } | null;
      user: { id: string; firstName: string | null; lastName: string | null; isExternal: boolean; billRateCents: number | null; costRateCents: number | null } | null;
    }>;
    /** People who finished jobs here, by name — billed by the hour if they hold no assignment. */
    jobWorkers: Map<string, string>;
    billByOf: (userId: string) => BillByValue;
    book: Awaited<ReturnType<typeof loadRateBook>>;
    ratesFor: (worker: { id?: string; billRateCents?: number | null; costRateCents?: number | null } | null, day: string) => { billRateCents: number | null; costRateCents: number | null };
    billedTasks: Set<string>;
  }): Promise<{ hourEntries: HoursEntry[]; dayEntries: DayEntry[]; workDays: string[] }> {
    const { organizationId, spaceId, tz, assignments, billByOf, book, ratesFor } = args;
    const people = new Map<string, { name: string; assignment?: (typeof assignments)[number] }>();
    for (const a of assignments) {
      if (a.user?.isExternal) continue; // neither paid nor billed by us
      people.set(a.userId, { name: personName(a.user) || 'Worker', assignment: a });
    }
    for (const [id, name] of args.jobWorkers) if (!people.has(id)) people.set(id, { name });
    if (people.size === 0) return { hourEntries: [], dayEntries: [], workDays: [] };
    const ids = [...people.keys()];
    const fromDay = parseDayKey(args.from);
    const toDay = parseDayKey(args.to);
    // A day of slack each side: the period is in the workspace's zone, the columns are UTC.
    const DAY_MS = 86_400_000;
    const range = {
      ...(fromDay && { gte: new Date(Date.parse(`${fromDay}T00:00:00Z`) - DAY_MS) }),
      ...(toDay && { lte: new Date(Date.parse(`${toDay}T23:59:59.999Z`) + DAY_MS) }),
    };
    const bounded = !!(fromDay || toDay);

    const [entries, billedRuns, jobs] = await Promise.all([
      this.prisma.timeEntry
        .findMany({
          where: {
            organizationId,
            locationId: spaceId,
            userId: { in: ids },
            approvalStatus: { not: 'REJECTED' },
            ...(bounded ? { clockInAt: range } : {}),
          },
          select: {
            userId: true,
            clockInAt: true,
            clockOutAt: true,
            paidMinutes: true,
            totalMinutes: true,
            unpaidBreakMinutes: true,
            expectedClockInAt: true,
            expectedClockOutAt: true,
            // Shift hours are the shift alone: its own length, and where approved overtime began.
            shift: { select: { startLocal: true, endLocal: true } },
            overtimeRequests: {
              where: { status: { in: ['APPROVED', 'COMPLETED'] } },
              select: { overtimeStartAt: true },
              orderBy: { cycle: 'asc' },
              take: 1,
            },
          },
        })
        .then((rows) =>
          rows.map(({ shift, overtimeRequests, ...e }) => ({
            ...e,
            shiftLengthMinutes: shift ? shiftLengthMinutes(shift.startLocal, shift.endLocal) : null,
            overtimeStartAt: overtimeRequests[0]?.overtimeStartAt ?? null,
          })),
        ),
      this.prisma.invoiceItem.findMany({
        where: {
          lineKind: { in: ['HOURS', 'DAYS'] },
          workerId: { in: ids },
          invoice: { organizationId, spaceId, status: { not: 'CANCELED' } },
        },
        select: { lineKind: true, workerId: true, dayFrom: true, dayTo: true },
      }),
      // Every finished job here by these people — billed or not, a day worked is a day worked.
      this.prisma.task.findMany({
        where: {
          organizationId, spaceId, status: FINISHED,
          OR: [
            { serviceReport: { completedById: { in: ids }, ...(bounded ? { completedAt: range } : {}) } },
            { serviceReport: null, assignedToId: { in: ids }, ...(bounded ? { updatedAt: range } : {}) },
          ],
        },
        select: {
          id: true, assignedToId: true, updatedAt: true,
          serviceReport: { select: { completedById: true, completedAt: true, workDuration: true } },
        },
      }),
    ]);
    const dayOf = (at: Date) => dayKeyIn(at, tz);
    const jobMarks = jobs.map((j) => ({
      id: j.id,
      userId: j.serviceReport?.completedById ?? j.assignedToId,
      at: j.serviceReport?.completedAt ?? j.updatedAt,
      minutes: Math.round((j.serviceReport?.workDuration ?? 0) / 60),
    }));
    // Counted time per person per day — the rule shared with the statement and the margin.
    const minutesOn = countedMinutesByDay(entries, jobMarks, dayOf);
    /*
      What the CLIENT is charged per day: each person's own basis (counted,
      clocked or shift). Cost stays on `minutesOn` — what the person is owed
      does not change with what the client is billed.
    */
    const basisOf = (userId: string) => effectiveHoursBasis(people.get(userId)?.assignment?.hoursBasis);
    const billed = minutesByDay(entries, jobMarks, dayOf, basisOf);
    // Every basis for everybody, so the screen can show what each choice would bill. In memory, no query.
    const byBasis = {
      COUNTED: minutesOn,
      CLOCKED: minutesByDay(entries, jobMarks, dayOf, () => 'CLOCKED').minutes,
      SHIFT: minutesByDay(entries, jobMarks, dayOf, () => 'SHIFT').minutes,
    } as const;
    const key = (d: Date | null) => (d ? toISODateString(d) : null);
    const alreadyBilled = (userId: string, kind: 'HOURS' | 'DAYS', d: string) =>
      billedRuns.some((r) => r.workerId === userId && r.lineKind === kind && key(r.dayFrom)! <= d && d <= (key(r.dayTo) ?? key(r.dayFrom))!);
    const inPeriod = (d: string) => (!fromDay || d >= fromDay) && (!toDay || d <= toDay);

    const hourEntries: HoursEntry[] = [];
    const dayEntries: DayEntry[] = [];
    const workDays = new Set<string>();
    for (const [userId, p] of people) {
      const a = p.assignment;
      const workRole = a?.workRole?.kind === 'WORK' ? a.workRole : null;
      const billBy = billByOf(userId);
      const worker = a?.user ? { ...a.user, id: userId } : { id: userId };
      const daysWithTime = [...minutesOn.keys()]
        .filter((k) => k.startsWith(`${userId}|`))
        .map((k) => k.split('|')[1]!)
        .filter(inPeriod)
        .sort();
      const base = { workerId: userId, workerName: p.name, workRoleId: workRole?.id ?? null, workRoleName: workRole?.name ?? null };

      // HOURS: time on site, at the hourly rate in force each day; split where it changed.
      if (billsHours(billBy)) {
        const basis = basisOf(userId);
        const days = daysWithTime.filter((d) => !alreadyBilled(userId, 'HOURS', d) && (billed.minutes.get(`${userId}|${d}`) ?? 0) > 0);
        for (const d of days) workDays.add(d);
        for (const run of book.splitDaysWith(days, (d) => ratesFor(worker, d).billRateCents)) {
          let minutes = 0;
          let owedMinutes = 0;
          let count = 0;
          let noShiftDays = 0;
          const alt = { COUNTED: 0, CLOCKED: 0, SHIFT: 0 };
          const runDays: string[] = [];
          for (const d of days) {
            if (d < run.fromDay || d > run.toDay) continue;
            const k = `${userId}|${d}`;
            for (const b of ['COUNTED', 'CLOCKED', 'SHIFT'] as const) alt[b] += byBasis[b].get(k) ?? 0;
            minutes += billed.minutes.get(k) ?? 0;
            owedMinutes += minutesOn.get(k) ?? 0;
            count += 1;
            runDays.push(d);
            if (billed.noShift.has(k)) noShiftDays += 1;
          }
          // Cost: what the person is owed for these days (counted time), whatever the client is billed.
          const cost = labourCost({
            days: runDays,
            minutesOn: (d) => minutesOn.get(`${userId}|${d}`) ?? 0,
            hourCostOn: (d) => ratesFor(worker, d).costRateCents,
            dayCostOn: (d) => book.personDayCostOn(d, userId, a?.id),
            withHourly: true,
            withDaily: !(workRole && billsDays(billBy)),
          });
          hourEntries.push({
            ...base,
            // To the minute — shown as "113 h 59 min" (shared formatHoursMinutes).
            hours: Math.round(minutes) / 60,
            days: count,
            fromDay: run.fromDay,
            toDay: run.toDay,
            hourRateCents: run.cents,
            costCents: cost.cents,
            costHourRateCents: cost.hourRateCents,
            costDayRateCents: cost.dayRateCents,
            countedHours: Math.round(owedMinutes) / 60,
            hoursBasis: basis,
            ...(basis === 'SHIFT' ? { noShiftDays } : {}),
            hoursByBasis: {
              COUNTED: Math.round(alt.COUNTED) / 60,
              CLOCKED: Math.round(alt.CLOCKED) / 60,
              SHIFT: Math.round(alt.SHIFT) / 60,
            },
            assignmentId: a?.id ?? null,
            // The jobs these hours cover — marked billed with the line.
            taskIds: jobMarks
              .filter((j) => j.userId === userId && !args.billedTasks.has(j.id) && run.fromDay <= dayOf(j.at) && dayOf(j.at) <= run.toDay)
              .map((j) => j.id),
          });
        }
      }

      // DAYS: every day worked, at the role's day rate here (else its default).
      if (workRole && billsDays(billBy)) {
        const days = daysWithTime.filter((d) => !alreadyBilled(userId, 'DAYS', d));
        for (const d of days) workDays.add(d);
        for (const run of book.splitDaysWith(days, (d) => book.dayRateOn(d, workRole.id, spaceId))) {
          let minutes = 0;
          const runDays: string[] = [];
          for (const d of days) {
            if (d < run.fromDay || d > run.toDay) continue;
            minutes += minutesOn.get(`${userId}|${d}`) ?? 0;
            runDays.push(d);
          }
          const cost = labourCost({
            days: runDays,
            minutesOn: (d) => minutesOn.get(`${userId}|${d}`) ?? 0,
            hourCostOn: (d) => ratesFor(worker, d).costRateCents,
            dayCostOn: (d) => book.personDayCostOn(d, userId, a?.id),
            withHourly: !billsHours(billBy),
            withDaily: true,
          });
          dayEntries.push({
            ...base,
            days: run.days,
            fromDay: run.fromDay,
            toDay: run.toDay,
            dayRateCents: run.cents,
            costCents: cost.cents,
            costHourRateCents: cost.hourRateCents,
            costDayRateCents: cost.dayRateCents,
            hours: Math.round((minutes / 60) * 100) / 100,
          });
        }
      }
    }
    return { hourEntries, dayEntries, workDays: [...workDays] };
  }
}
