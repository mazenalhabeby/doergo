/**
 * What a person's days cost you — the "both add up" rule.
 *
 * A person may have an hourly cost, a day cost, or both, on their profile.
 * Their cost over some days is:
 *
 *     counted hours × hourly cost  +  days × day cost
 *
 * using only the rates they have, each read ON THE DAY (a raise never rewrites
 * the past). One rate is enough: somebody paid by the day is not "missing" an
 * hourly cost. Only a person with NO cost rate on any of these days is null —
 * that is the case the screen warns about by name.
 *
 * ⚠️ ONE LINE CARRIES EACH PART. A person billed by hour AND day has two lines
 * over the same days; costing both parts on both would charge them twice. So
 * the hourly part rides on the HOURS line and the day part on the DAYS line,
 * and a line takes the other part only when the person has no line of that
 * kind (`withHourly` / `withDaily`).
 */
export interface LabourCostInput {
  days: string[];
  /** Counted (owed) minutes on a day — never the client's billing basis. */
  minutesOn: (day: string) => number;
  hourCostOn: (day: string) => number | null;
  dayCostOn: (day: string) => number | null;
  withHourly: boolean;
  withDaily: boolean;
}

export interface LabourCost {
  /** null = no cost rate of either kind on any day. */
  cents: number | null;
  /** The rates in force on the last day, for the reader; null where none. */
  hourRateCents: number | null;
  dayRateCents: number | null;
}

export function labourCost(i: LabourCostInput): LabourCost {
  let cents = 0;
  let known = false;
  let hourRateCents: number | null = null;
  let dayRateCents: number | null = null;
  for (const d of i.days) {
    if (i.withHourly) {
      const h = i.hourCostOn(d);
      if (h != null) {
        cents += (h * i.minutesOn(d)) / 60;
        known = true;
        hourRateCents = h;
      }
    }
    if (i.withDaily) {
      const c = i.dayCostOn(d);
      if (c != null) {
        cents += c;
        known = true;
        dayRateCents = c;
      }
    }
  }
  return { cents: known ? Math.round(cents) : null, hourRateCents, dayRateCents };
}
