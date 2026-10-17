/** Small pieces of a labour line: rounding, minutes, the hours label, one line of each kind. */
import { roundCents } from '../invoice-totals';
import type { DayEntry, LabourEntry, LabourLine } from './types';

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
  // The same rounding as every other invoice line (invoice-totals.ts).
  return roundCents(billRateCents * h);
}

/** Hours held to the nearest whole minute. */
export function toMinute(hours: number): number {
  return Number.isFinite(hours) ? Math.round(hours * 60) / 60 : 0;
}

/**
 * Hours as a person reads time: "113 h 59 min", "8 h", "45 min". Units are the
 * same in every supported language, so this is not translated.
 */
export function formatHoursMinutes(hours: number): string {
  const total = Math.max(0, Math.round((Number.isFinite(hours) ? hours : 0) * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
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

export { round2, byWorker, defaultDescribeDays, withRole, hoursLine, jobLine, listedJob, dayLine, headingLine };
