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
  /** Resolved through the rate ladder. Null means no rate applies. */
  billRateCents: number | null;
  costRateCents: number | null;
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

/**
 * Write the work up.
 *
 * @param unassignedLabel what to call work with no worker on it — the caller's,
 *                        because this module does not speak the user's language.
 */
export function buildLabourLines(
  entries: LabourEntry[],
  grouping: LabourGrouping,
  unassignedLabel = 'Unassigned',
): LabourLine[] {
  const usable = entries.filter((e) => e && Number.isFinite(e.hours));

  if (grouping === 'task') {
    return usable.map((e) => ({
      description: `${e.taskTitle}${e.workerName ? ` — ${e.workerName}` : ''} · ${hoursLabel(e.hours)}`,
      quantity: round2(e.hours),
      unitPriceCents: e.billRateCents ?? 0,
      amountCents: amountCentsOf(e.hours, e.billRateCents),
      descriptive: false,
      taskId: e.taskId,
      reportId: e.reportId ?? null,
      billRateCents: e.billRateCents,
      costRateCents: e.costRateCents,
      billedHours: round2(e.hours),
    }));
  }

  const lines: LabourLine[] = [];
  for (const bucket of byWorker(usable).values()) {
    const hours = bucket.reduce((s, e) => s + (e.hours > 0 ? e.hours : 0), 0);
    const rate = bucket[0]!.billRateCents;
    const name = bucket[0]!.workerName || unassignedLabel;

    /*
      ⚠️ The hours are summed, THEN rounded, and the money follows the rounded
      figure — so this line multiplies out exactly as printed.

      It also means the three groupings can land a cent or two apart on awkward
      hours, and that is the right trade. A total that differs by 2c between two
      layouts is invisible to everyone; a LINE that does not multiply out is
      found by the first customer with a calculator. The document a person
      checks has to be internally true before two documents have to agree.
    */
    lines.push({
      description: `${name} · ${hoursLabel(hours)}`,
      quantity: round2(hours),
      unitPriceCents: rate ?? 0,
      amountCents: amountCentsOf(hours, rate),
      descriptive: false,
      taskId: null,
      reportId: null,
      billRateCents: rate,
      costRateCents: bucket[0]!.costRateCents,
      billedHours: round2(hours),
    });

    if (grouping === 'both') {
      /*
        The jobs, listed and NOT charged. The client sees what was done; the
        hours above are what they pay for. Charging these too would bill the
        same work twice, which is why `descriptive` exists rather than a
        comment asking the next person to remember.
      */
      for (const e of bucket) {
        lines.push({
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
        });
      }
    }
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
