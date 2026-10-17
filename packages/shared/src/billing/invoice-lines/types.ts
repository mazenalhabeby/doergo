/** Labour on an invoice: the entries (hours, days) and the lines built from them. */
import type { HoursBasis } from '../hours-basis';

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
  /** The person's hourly / day cost on the last day — what "You pay them" shows. Internal. */
  costHourRateCents?: number | null;
  costDayRateCents?: number | null;
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
