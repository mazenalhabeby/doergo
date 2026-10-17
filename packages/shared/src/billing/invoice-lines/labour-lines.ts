/** A job- or member-grouped invoice's labour lines, and their totals. */
import {
  byWorker,
  dayLine,
  defaultDescribeDays,
  headingLine,
  hoursLine,
  jobLine,
  listedJob,
  withRole,
} from './line-parts';
import type { DayEntry, LabourEntry, LabourGrouping, LabourLine, LabourLineOptions } from './types';

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
  const listedFor = (k: string) => listedOnly.filter((e) => workerKey(e.workerId, e.workerName) === k).map(listedJob);

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
