/** A workspace invoice: one HOURS and one DAYS line per person, and the totals of each kind. */
import type { HoursBasis } from '../hours-basis';
import { dayLine, defaultDescribeDays, headingLine, listedJob, round2, toMinute, withRole } from './line-parts';
import type { DayEntry, LabourEntry, LabourLine } from './types';

/**
 * Hours clocked at a workspace, at ONE hourly rate — a person's time on site,
 * not the time written on their jobs. Split only where their rate changed.
 */
export interface HoursEntry {
  workerId: string;
  workerName: string;
  workRoleId?: string | null;
  workRoleName?: string | null;
  /** Counted hours in this run, two decimals. */
  hours: number;
  /** Days in the run that had time — for the reader. */
  days: number;
  fromDay: string;
  toDay: string;
  hourRateCents: number | null;
  /** What these days cost you (billing/labour-cost.ts); null = no cost rate at all. Internal. */
  costCents?: number | null;
  /** The person's hourly / day cost on the last day — what "You pay them" shows. Internal. */
  costHourRateCents?: number | null;
  costDayRateCents?: number | null;
  /** Counted hours on these days — what the cost is reckoned on, whatever the client's basis. */
  countedHours?: number;
  /** The finished jobs inside these days — marked billed with the line. */
  taskIds?: string[];
  /** Which hours these are (billing/hours-basis.ts). Absent = COUNTED. */
  hoursBasis?: HoursBasis;
  /** SHIFT only: days in the run with no planned shift, billed at counted time instead. */
  noShiftDays?: number;
  /** The same days' hours under each basis — so the screen can offer the choice with its figures. */
  hoursByBasis?: Record<HoursBasis, number>;
  /** The person's place in this workspace — where a changed basis is saved. */
  assignmentId?: string | null;
}

/** One person on a WORKSPACE invoice: their hours runs, day runs and jobs. */
export interface PersonWork {
  workerId: string;
  workerName: string;
  workRoleId?: string | null;
  workRoleName?: string | null;
  hours: HoursEntry[];
  days: DayEntry[];
  /** Their finished jobs — listed (never charged: the hours and days pay for them). */
  jobs: LabourEntry[];
}

export interface WorkspaceLineOptions {
  /** List each person's jobs under their lines, at no charge. */
  listJobs?: boolean;
  groupByRole?: boolean;
  noRoleLabel?: string;
  /** How a run reads, in the reader's language. `split` = this person has more than one run of this kind. */
  describeHours?: (h: HoursEntry, split: boolean) => string;
  describeDays?: (d: DayEntry, split: boolean) => string;
}

function hoursRunLine(h: HoursEntry, text: string): LabourLine {
  /*
    ⚠️ TO THE MINUTE, not to two decimals: time on site is shown as "113 h 59 min",
    and 113.98 h is 113 h 58.8 min — a figure nobody worked. The amount follows
    the exact minutes, so "113 h 59 min × $78" is still checkable by the payer.
  */
  const qty = toMinute(h.hours);
  return {
    description: text,
    quantity: qty,
    unitPriceCents: h.hourRateCents ?? 0,
    amountCents: Number.isFinite(qty) && qty > 0 && h.hourRateCents != null ? Math.round(h.hourRateCents * qty) : 0,
    descriptive: false,
    taskId: null,
    reportId: null,
    billRateCents: h.hourRateCents,
    costRateCents: null,
    billedHours: qty,
    billedDays: null,
    kind: 'HOURS',
    workerId: h.workerId,
    dayFrom: h.fromDay,
    dayTo: h.toDay,
    taskIds: h.taskIds ?? [],
    hoursBasis: h.hoursBasis ?? 'COUNTED',
  };
}

/**
 * A WORKSPACE invoice: per person, ONE hours line and ONE days line for the
 * period — "Karim · 200 h × €25", "Karim · 20 days × €150" — split only where
 * a rate changed (never an averaged price).
 *
 * ⚠️ Hours are the time ON SITE (counted clock-ins), not the time written on
 * jobs: a site worker is billed for the hours they were there. The jobs are
 * listed under them at no charge when asked for, and are always carried on the
 * hours line (`taskIds`) so the same job never comes back on the next invoice.
 *
 * People in name order; under role headings when `groupByRole`.
 */
export function buildWorkspaceLines(people: PersonWork[], options: WorkspaceLineOptions = {}): LabourLine[] {
  const describeHours =
    options.describeHours ??
    ((h, split) => `${h.workerName} · ${round2(h.hours)}h${split ? `, ${h.fromDay} – ${h.toDay}` : ''}`);
  const describeDays = options.describeDays ?? defaultDescribeDays;
  const anyRole = people.some((p) => p.workRoleId);
  const grouped = options.groupByRole && anyRole;
  const suffix = (p: PersonWork) => (!grouped && anyRole ? (p.workRoleName ?? null) : null);

  const personLines = (p: PersonWork): LabourLine[] => {
    const out: LabourLine[] = [];
    const hours = p.hours.filter((h) => h.hours > 0);
    const days = p.days.filter((d) => d.days > 0);
    for (const h of hours) out.push(hoursRunLine(h, withRole(describeHours(h, hours.length > 1), suffix(p))));
    for (const d of days) out.push(dayLine(d, withRole(describeDays(d, days.length > 1), suffix(p))));
    if (options.listJobs) for (const j of p.jobs) out.push(listedJob(j));
    return out;
  };
  const byName = (a: PersonWork, b: PersonWork) => a.workerName.localeCompare(b.workerName);
  const withWork = people.filter(
    (p) =>
      p.hours.some((h) => h.hours > 0) || p.days.some((d) => d.days > 0) || (options.listJobs && p.jobs.length > 0),
  );

  if (!grouped) return [...withWork].sort(byName).flatMap(personLines);

  const roleKey = (p: PersonWork) => p.workRoleId ?? '';
  const names = new Map<string, string>();
  for (const p of withWork)
    if (!names.has(roleKey(p))) names.set(roleKey(p), p.workRoleName || options.noRoleLabel || 'Other');
  const order = [...names.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : names.get(a)!.localeCompare(names.get(b)!)));
  const lines: LabourLine[] = [];
  for (const k of order) {
    lines.push(headingLine(names.get(k)!));
    for (const p of withWork.filter((x) => roleKey(x) === k).sort(byName)) lines.push(...personLines(p));
  }
  return lines;
}

/** Hours and days on a set of lines — the two figures a reader looks for first. */
export function hoursAndDaysTotals(
  lines: Array<{
    kind?: LabourLine['kind'] | null;
    lineKind?: LabourLine['kind'] | null;
    quantity: number;
    amountCents?: number;
    amount?: number;
  }>,
): {
  hours: number;
  hoursCents: number;
  days: number;
  daysCents: number;
} {
  let hours = 0,
    hoursCents = 0,
    days = 0,
    daysCents = 0;
  for (const l of lines) {
    const kind = l.kind ?? l.lineKind;
    const cents = l.amountCents ?? Math.round((l.amount ?? 0) * 100);
    if (kind === 'HOURS') {
      hours += l.quantity;
      hoursCents += cents;
    }
    if (kind === 'DAYS') {
      days += l.quantity;
      daysCents += cents;
    }
  }
  return { hours: toMinute(hours), hoursCents, days, daysCents };
}
