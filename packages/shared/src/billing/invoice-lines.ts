import type { HoursBasis } from './hours-basis';
/**
 * The same work, written up three ways.
 *
 * An invoice for a fortnight on a site can reasonably say any of these:
 *
 *   BY JOB     Replace circulation pump — Ahmed · 3h ............ €120.00
 *              Annual service — Ahmed · 2.5h ..................... €100.00
 *
 *   BY PERSON  Ahmed Karim · 37.5h ............................. €1,500.00
 *
 *   BOTH       Ahmed Karim · 37.5h ............................. €1,500.00
 *                · Replace circulation pump — 3h
 *                · Annual service — 2.5h
 *
 * Which one is right is the customer's business, not ours. A managing agent
 * wants the jobs; a staffing client wants the hours; somebody presenting to a
 * board wants a figure with the detail underneath it.
 *
 * ⚠️ THE PROPERTY THIS PROTECTS IS THAT EVERY LINE MULTIPLIES OUT. Whatever
 * grouping is chosen, hours × rate on the page equals the amount on the page —
 * because the first customer to check an invoice with a calculator finds
 * anything else, and that is a phone call and a credit note.
 *
 * ⚠️ Which means the groupings can land APART on awkward hours — and by more
 * than loose change. Seven jobs of twenty minutes is 2.33h together and 7 ×
 * 0.33h = 2.31h itemised, because each line's hours round to two decimals; at
 * €85.33 that is €1.70. Neither figure is wrong: an invoice charges what its
 * lines SAY, and those lines say different amounts of time. The aggregate is
 * the more faithful of the two, and itemising can only ever lose time, never
 * invent it.
 *
 * Something has to give, and this is the right way round: a line reading
 * "5.83h × €40.00 = €233.33" is found by the first customer with a calculator,
 * while two layouts of one fortnight differing is seen by nobody who is not
 * generating both. A document has to be internally true before two documents
 * have to agree with each other.
 *
 * The first version of this file promised the opposite and its own test caught
 * it, which is the only reason the trade was ever made deliberately.
 */

/** How the labour is written up. */
export type LabourGrouping = 'task' | 'member' | 'both';

/** One entry of completed work, as the server gathered it. */
export interface LabourEntry {
  taskId: string;
  taskTitle: string;
  reportId?: string | null;
  workerId?: string | null;
  workerName?: string | null;
  hours: number;
  /** Resolved through the rate ladder ON THE DAY the work was done. Null means no rate applies. */
  billRateCents: number | null;
  costRateCents: number | null;
  /** The worker's trade in this workspace, when they have one. */
  workRoleId?: string | null;
  workRoleName?: string | null;
  /**
   * False when this worker is billed by the DAY only: the job is still listed
   * (and so marked billed — it must not come back on next month's invoice) but
   * its hours are not charged, because the days already pay for them.
   */
  hoursBillable?: boolean;
}

/**
 * Days worked at the workspace, at ONE day rate.
 *
 * A person whose day rate changed inside the period arrives as two of these —
 * "7 days at $200" and "4 days at $220" — never as an average.
 */
export interface DayEntry {
  workerId: string;
  workerName: string;
  workRoleId?: string | null;
  workRoleName?: string | null;
  days: number;
  /** First and last day of this run, `YYYY-MM-DD`. */
  fromDay: string;
  toDay: string;
  dayRateCents: number | null;
  /**
   * What these days COST — the person's counted hours on them × their cost
   * rate on each day. Null when a day has no cost rate anywhere (unknown, not
   * free). Internal: stripped for anyone without canViewLabourCost.
   */
  costCents?: number | null;
  /** Counted hours on these days, for the reader. */
  hours?: number;
}

export interface LabourLineOptions {
  /** Days worked, priced per day. Empty or absent = nobody is billed by the day. */
  days?: DayEntry[];
  /**
   * Put the lines under a heading per work role (Mechanic, Electrician).
   * Off: one list, and each worker's line names their role at the end instead.
   */
  groupByRole?: boolean;
  /** The heading for people with no work role, when others have one. */
  noRoleLabel?: string;
  /**
   * How a run of days reads — the caller's, because this module does not speak
   * the reader's language or format their dates. `split` is true when the same
   * person has more than one run (a rate changed), which is when the dates
   * matter.
   */
  describeDays?: (entry: DayEntry, split: boolean) => string;
}

export interface LabourLine {
  description: string;
  /** Hours, or 1 for a line that is not time-based. */
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  /**
   * A line that describes work without charging for it.
   *
   * ⚠️ Load-bearing in `both`: the jobs are listed so the client can see what
   * was done, and charging for them as well as for the hours they are part of
   * would bill the same work twice. The caller must price these at zero.
   */
  descriptive: boolean;
  taskId?: string | null;
  reportId?: string | null;
  /** Snapshot — the rates that applied on the day. Null on a descriptive line. */
  billRateCents: number | null;
  costRateCents: number | null;
  billedHours: number | null;
  /** Days, on a DAYS line. */
  billedDays: number | null;
  /**
   * HOURS / DAYS for a charged labour line, HEADING for a work-role heading
   * (priced at zero, only organizes the page), null for a listed job.
   */
  kind: 'HOURS' | 'DAYS' | 'HEADING' | null;
  /** DAYS lines: whose days and which run, recorded so they are never billed twice. */
  workerId: string | null;
  dayFrom: string | null;
  dayTo: string | null;
  /** HOURS lines on a workspace invoice: the jobs those hours cover, so they are marked billed. */
  taskIds?: string[];
  /** HOURS lines on a workspace invoice: which hours were billed (counted / clocked / shift). */
  hoursBasis?: HoursBasis | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One line's charge, in cents.
 *
 * ⚠️ CHARGED ON THE HOURS THAT ARE PRINTED, not on the raw ones. A line showing
 * "5.83h × €40.00" and charging €233.33 does not multiply out, and a customer
 * checking their invoice with a calculator finds it — which is a phone call and
 * a credit note, not a rounding curiosity.
 *
 * So the quantity is rounded first and the money follows from it. Every line on
 * every invoice this produces can be verified by the person paying it.
 */
function amountCentsOf(hours: number, billRateCents: number | null): number {
  if (billRateCents === null) return 0;
  const h = Number.isFinite(hours) && hours > 0 ? round2(hours) : 0;
  return Math.round(billRateCents * h);
}

/** Hours as a person reads them — two decimals, no trailing noise. */
function hoursLabel(hours: number): string {
  return `${round2(hours)}h`;
}

/**
 * Group the entries by worker, keeping rate differences apart.
 *
 * ⚠️ Split by (worker, rate) and not by worker alone. One person normally has
 * ONE rate at one client, so this is almost always one bucket each — but if a
 * rate changed mid-period, or a task carries no rate at all, folding them into
 * a single line would have to invent an average, and an averaged rate on an
 * invoice is a number the customer cannot check against anything.
 */
function byWorker(entries: LabourEntry[]): Map<string, LabourEntry[]> {
  const out = new Map<string, LabourEntry[]>();
  for (const e of entries) {
    const key = `${e.workerId ?? e.workerName ?? 'unassigned'}|${e.billRateCents ?? 'none'}`;
    const bucket = out.get(key);
    if (bucket) bucket.push(e);
    else out.set(key, [e]);
  }
  return out;
}

/** The default wording of a run of days, for callers that do not supply one. */
function defaultDescribeDays(d: DayEntry, split: boolean): string {
  const n = `${d.days} day${d.days === 1 ? '' : 's'}`;
  return split ? `${d.workerName} · ${n} worked, ${d.fromDay} – ${d.toDay}` : `${d.workerName} · ${n} worked`;
}

const withRole = (text: string, role: string | null | undefined) => (role ? `${text} · ${role}` : text);

/** One charged line for a worker's hours at one rate. */
function hoursLine(bucket: LabourEntry[], name: string, roleSuffix: string | null): LabourLine {
  const hours = bucket.reduce((s, e) => s + (e.hours > 0 ? e.hours : 0), 0);
  const rate = bucket[0]!.billRateCents;
  /*
    ⚠️ The hours are summed, THEN rounded, and the money follows the rounded
    figure — so this line multiplies out exactly as printed.

    It also means the three groupings can land a cent or two apart on awkward
    hours, and that is the right trade. A total that differs by 2c between two
    layouts is invisible to everyone; a LINE that does not multiply out is
    found by the first customer with a calculator. The document a person
    checks has to be internally true before two documents have to agree.
  */
  return {
    description: withRole(`${name} · ${hoursLabel(hours)}`, roleSuffix),
    quantity: round2(hours),
    unitPriceCents: rate ?? 0,
    amountCents: amountCentsOf(hours, rate),
    descriptive: false,
    taskId: null,
    reportId: null,
    billRateCents: rate,
    costRateCents: bucket[0]!.costRateCents,
    billedHours: round2(hours),
    billedDays: null,
    kind: 'HOURS',
    workerId: null,
    dayFrom: null,
    dayTo: null,
  };
}

/** One job, charged on its own (BY JOB). */
function jobLine(e: LabourEntry, roleSuffix: string | null): LabourLine {
  return {
    description: withRole(`${e.taskTitle}${e.workerName ? ` — ${e.workerName}` : ''} · ${hoursLabel(e.hours)}`, roleSuffix),
    quantity: round2(e.hours),
    unitPriceCents: e.billRateCents ?? 0,
    amountCents: amountCentsOf(e.hours, e.billRateCents),
    descriptive: false,
    taskId: e.taskId,
    reportId: e.reportId ?? null,
    billRateCents: e.billRateCents,
    costRateCents: e.costRateCents,
    billedHours: round2(e.hours),
    billedDays: null,
    kind: 'HOURS',
    workerId: null,
    dayFrom: null,
    dayTo: null,
  };
}

/**
 * One job, listed and NOT charged — under a per-person line, or under somebody
 * billed by the day. The client sees what was done; charging it too would bill
 * the same work twice, which is why `descriptive` exists rather than a comment
 * asking the next person to remember.
 */
function listedJob(e: LabourEntry): LabourLine {
  return {
    description: `${e.taskTitle} — ${hoursLabel(e.hours)}`,
    quantity: 1,
    unitPriceCents: 0,
    amountCents: 0,
    descriptive: true,
    taskId: e.taskId,
    reportId: e.reportId ?? null,
    billRateCents: null,
    costRateCents: null,
    billedHours: null,
    billedDays: null,
    kind: null,
    workerId: null,
    dayFrom: null,
    dayTo: null,
  };
}

function dayLine(d: DayEntry, text: string): LabourLine {
  return {
    description: text,
    quantity: d.days,
    unitPriceCents: d.dayRateCents ?? 0,
    amountCents: d.dayRateCents === null ? 0 : d.dayRateCents * d.days,
    descriptive: false,
    taskId: null,
    reportId: null,
    billRateCents: d.dayRateCents,
    costRateCents: null,
    billedHours: null,
    billedDays: d.days,
    kind: 'DAYS',
    workerId: d.workerId,
    dayFrom: d.fromDay,
    dayTo: d.toDay,
  };
}

function headingLine(text: string): LabourLine {
  return {
    description: text,
    quantity: 0,
    unitPriceCents: 0,
    amountCents: 0,
    descriptive: true,
    taskId: null,
    reportId: null,
    billRateCents: null,
    costRateCents: null,
    billedHours: null,
    billedDays: null,
    kind: 'HEADING',
    workerId: null,
    dayFrom: null,
    dayTo: null,
  };
}

const workerKey = (id: string | null | undefined, name: string | null | undefined) => id ?? name ?? 'unassigned';

/** The lines of ONE block of workers (a role's, or everybody's). */
function blockLines(
  entries: LabourEntry[],
  days: DayEntry[],
  grouping: LabourGrouping,
  unassignedLabel: string,
  roleSuffixOf: (e: { workRoleName?: string | null }) => string | null,
  describe: (d: DayEntry, split: boolean) => string,
): LabourLine[] {
  const charged = entries.filter((e) => e.hoursBillable !== false);
  const listedOnly = entries.filter((e) => e.hoursBillable === false);

  // Runs per worker, so a person's dates show only when their rate changed.
  const runsOf = new Map<string, DayEntry[]>();
  for (const d of days) {
    const k = workerKey(d.workerId, d.workerName);
    const list = runsOf.get(k);
    if (list) list.push(d);
    else runsOf.set(k, [d]);
  }
  const daysFor = (k: string): LabourLine[] => {
    const runs = runsOf.get(k) ?? [];
    runsOf.delete(k);
    return runs.map((d) => dayLine(d, withRole(describe(d, runs.length > 1), roleSuffixOf(d))));
  };
  const listedFor = (k: string) =>
    listedOnly.filter((e) => workerKey(e.workerId, e.workerName) === k).map(listedJob);

  const lines: LabourLine[] = [];
  const seen = new Set<string>();

  if (grouping === 'task') {
    for (const e of charged) lines.push(jobLine(e, roleSuffixOf(e)));
    // Days after the jobs; a day-billed worker's jobs are listed under their days.
    for (const e of [...charged, ...listedOnly]) seen.add(workerKey(e.workerId, e.workerName));
    for (const k of seen) {
      lines.push(...daysFor(k));
      lines.push(...listedFor(k));
    }
  } else {
    // Each worker's rate buckets together, in order of first appearance.
    const byPerson = new Map<string, LabourEntry[][]>();
    for (const bucket of byWorker(charged).values()) {
      const k = workerKey(bucket[0]!.workerId, bucket[0]!.workerName);
      const list = byPerson.get(k);
      if (list) list.push(bucket);
      else byPerson.set(k, [bucket]);
    }
    for (const [k, buckets] of byPerson) {
      for (const bucket of buckets) {
        lines.push(hoursLine(bucket, bucket[0]!.workerName || unassignedLabel, roleSuffixOf(bucket[0]!)));
        if (grouping === 'both') for (const e of bucket) lines.push(listedJob(e));
      }
      // A person's days sit right under their hours.
      lines.push(...daysFor(k));
      lines.push(...listedFor(k));
      seen.add(k);
    }
    for (const e of listedOnly) {
      const k = workerKey(e.workerId, e.workerName);
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push(...daysFor(k));
      lines.push(...listedFor(k));
    }
  }
  // Anyone billed by the day who finished no job in the period still worked.
  for (const k of [...runsOf.keys()]) lines.push(...daysFor(k));
  return lines;
}

/**
 * Write the work up.
 *
 * @param unassignedLabel what to call work with no worker on it — the caller's,
 *                        because this module does not speak the user's language.
 * @param options         days worked and the role grouping; absent, this is
 *                        exactly the invoice it always was.
 */
export function buildLabourLines(
  entries: LabourEntry[],
  grouping: LabourGrouping,
  unassignedLabel = 'Unassigned',
  options: LabourLineOptions = {},
): LabourLine[] {
  const usable = entries.filter((e) => e && Number.isFinite(e.hours));
  const days = (options.days ?? []).filter((d) => d && d.days > 0);
  const describe = options.describeDays ?? defaultDescribeDays;
  const anyRole = usable.some((e) => e.workRoleId) || days.some((d) => d.workRoleId);

  if (!options.groupByRole || !anyRole) {
    // One list. Where people have trades, each worker's line names it.
    const suffix = anyRole ? (e: { workRoleName?: string | null }) => e.workRoleName ?? null : () => null;
    return blockLines(usable, days, grouping, unassignedLabel, suffix, describe);
  }

  /*
    A heading per work role, named roles alphabetically, then the people with
    no trade. The heading is a zero-priced line: it organizes the page and can
    never change what it adds up to.
  */
  const roleKey = (r: { workRoleId?: string | null }) => r.workRoleId ?? '';
  const names = new Map<string, string>();
  for (const r of [...usable, ...days]) {
    const k = roleKey(r);
    if (!names.has(k)) names.set(k, r.workRoleName || options.noRoleLabel || 'Other');
  }
  const order = [...names.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return names.get(a)!.localeCompare(names.get(b)!);
  });

  const lines: LabourLine[] = [];
  for (const k of order) {
    lines.push(headingLine(names.get(k)!));
    lines.push(
      ...blockLines(
        usable.filter((e) => roleKey(e) === k),
        days.filter((d) => roleKey(d) === k),
        grouping,
        unassignedLabel,
        () => null,
        describe,
      ),
    );
  }
  return lines;
}

/**
 * What the labour comes to.
 *
 * Descriptive lines are excluded by construction: they are priced at zero, so
 * this is a sum over everything and still correct. Written explicitly anyway,
 * because a future line type priced above zero and not meant to be charged
 * would otherwise be a silent arithmetic change.
 */
export function labourTotalCents(lines: LabourLine[]): number {
  return lines.reduce((sum, l) => sum + (l.descriptive ? 0 : l.amountCents), 0);
}

/** Day entries' total, for the summary above the lines. */
export function daysTotal(days: DayEntry[]): number {
  return days.reduce((s, d) => s + (d.days > 0 ? d.days : 0), 0);
}

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
  /** What these hours cost you; null when a day has no cost rate. Internal. */
  costCents?: number | null;
  /** The finished jobs inside these days — marked billed with the line. */
  taskIds?: string[];
  /** Which hours these are (billing/hours-basis.ts). Absent = COUNTED. */
  hoursBasis?: HoursBasis;
  /** SHIFT only: days in the run with no planned shift, billed at counted time instead. */
  noShiftDays?: number;
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
  const qty = round2(h.hours);
  return {
    description: text,
    quantity: qty,
    unitPriceCents: h.hourRateCents ?? 0,
    amountCents: amountCentsOf(qty, h.hourRateCents),
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
  const describeHours = options.describeHours ?? ((h, split) => `${h.workerName} · ${round2(h.hours)}h${split ? `, ${h.fromDay} – ${h.toDay}` : ''}`);
  const describeDays = options.describeDays ?? defaultDescribeDays;
  const anyRole = people.some((p) => p.workRoleId);
  const grouped = options.groupByRole && anyRole;
  const suffix = (p: PersonWork) => (!grouped && anyRole ? p.workRoleName ?? null : null);

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
  const withWork = people.filter((p) => p.hours.some((h) => h.hours > 0) || p.days.some((d) => d.days > 0) || (options.listJobs && p.jobs.length > 0));

  if (!grouped) return [...withWork].sort(byName).flatMap(personLines);

  const roleKey = (p: PersonWork) => p.workRoleId ?? '';
  const names = new Map<string, string>();
  for (const p of withWork) if (!names.has(roleKey(p))) names.set(roleKey(p), p.workRoleName || options.noRoleLabel || 'Other');
  const order = [...names.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : names.get(a)!.localeCompare(names.get(b)!)));
  const lines: LabourLine[] = [];
  for (const k of order) {
    lines.push(headingLine(names.get(k)!));
    for (const p of withWork.filter((x) => roleKey(x) === k).sort(byName)) lines.push(...personLines(p));
  }
  return lines;
}

/** Hours and days on a set of lines — the two figures a reader looks for first. */
export function hoursAndDaysTotals(lines: Array<{ kind?: LabourLine['kind'] | null; lineKind?: LabourLine['kind'] | null; quantity: number; amountCents?: number; amount?: number }>): {
  hours: number; hoursCents: number; days: number; daysCents: number;
} {
  let hours = 0, hoursCents = 0, days = 0, daysCents = 0;
  for (const l of lines) {
    const kind = l.kind ?? l.lineKind;
    const cents = l.amountCents ?? Math.round((l.amount ?? 0) * 100);
    if (kind === 'HOURS') { hours += l.quantity; hoursCents += cents; }
    if (kind === 'DAYS') { days += l.quantity; daysCents += cents; }
  }
  return { hours: round2(hours), hoursCents, days, daysCents };
}

