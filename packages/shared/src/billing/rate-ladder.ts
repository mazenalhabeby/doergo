/**
 * What an hour costs, and what an hour is billed at.
 *
 * ⚠️ SOME COMPANIES HAVE ONE RATE AND SOME HAVE TWO, and the product must not
 * ask which. A plumber charges €85 an hour and that is the whole story. A
 * staffing agency pays Ahmed €20 and bills the client €40, and the gap between
 * them is the business. Forcing the first company to think about "cost" is a
 * column of dashes they have to ignore forever; forcing the second to fake it
 * in one field loses the number they actually manage.
 *
 * So the mode is DISCOVERED, not configured — see `usesTwoRates`. The moment a
 * cost rate exists anywhere, there is a margin worth showing; until then there
 * is not, and nobody had to find a setting either way.
 *
 * Both rates resolve through the same ladder, INDEPENDENTLY. That independence
 * is what makes the agency case need no special mode at all: leave Ahmed's bill
 * rate blank and the client's contract rate wins it, set his cost rate and that
 * wins the other. Different rungs, one mechanism.
 *
 * ⚠️ EVERY LEVEL IS NULLABLE AND NULL MEANS INHERIT — never zero. Zero is a
 * real rate of nothing, and one typed into the wrong box bills a client €0
 * without a word. The two are kept distinguishable all the way down.
 *
 * Everything here is integer CENTS and pure. Money in floating point is a
 * rounding bug waiting for a large total, and a pure resolver is what lets the
 * invoice, the preview, the reports and the phone agree about one number.
 */

/** Which of the two rates is being asked for. */
export type RateKind = 'bill' | 'cost';

/**
 * Where a rate came from. Returned rather than inferred, because "why is this
 * €40" is the question somebody asks when it is wrong, and answering it from
 * four nullable columns after the fact is guesswork.
 */
export type RateLevel = 'contract' | 'member' | 'client' | 'organization';

/** The rungs, most specific first. Order is the rule. */
export const RATE_LEVELS: readonly RateLevel[] = [
  // This member, at this client. The negotiated exception.
  'contract',
  // What this person bills and costs, wherever they work.
  'member',
  // One rate for everyone at this client — the contract rate.
  'client',
  // The fallback when nothing else is set.
  'organization',
] as const;

/** One level's pair of rates. Both nullable, independently. */
export interface RatePair {
  billRateCents?: number | null;
  costRateCents?: number | null;
}

/**
 * The four places a rate can be set.
 *
 * ⚠️ Named by MEANING, not by table. `client` is a CUSTOMER workspace today and
 * the column behind it is `billableRateCents`; naming the input after the
 * column would tie this module to a schema it must outlive.
 */
export interface RateSources {
  contract?: RatePair | null;
  member?: RatePair | null;
  client?: RatePair | null;
  organization?: RatePair | null;
}

export interface ResolvedRate {
  /** Integer cents, or null when no level set one. */
  cents: number | null;
  /** Which level won, or null when none did. */
  level: RateLevel | null;
}

/** One level's value for one kind, with null and undefined collapsed. */
function at(sources: RateSources, level: RateLevel, kind: RateKind): number | null {
  const pair = sources[level];
  if (!pair) return null;
  const raw = kind === 'bill' ? pair.billRateCents : pair.costRateCents;
  /*
    ⚠️ `?? null` and NOT `|| null`. A rate of 0 is a value somebody chose — an
    internal job billed at nothing, a salaried member whose hours carry no
    marginal cost — and `||` would silently send it back to the ladder to be
    overwritten by the organization default.
  */
  return raw ?? null;
}

/**
 * The rate that applies, and the level it came from.
 *
 * The first level that has a value wins. No averaging, no addition: a rate is
 * one number chosen by whoever set the most specific one.
 */
export function resolveRate(kind: RateKind, sources: RateSources): ResolvedRate {
  for (const level of RATE_LEVELS) {
    const cents = at(sources, level, kind);
    if (cents !== null) return { cents, level };
  }
  return { cents: null, level: null };
}

/**
 * Every rung, in order, with the winner marked — for a screen that has to
 * explain itself.
 *
 * The same walk as `resolveRate`, deliberately sharing `at()`: a second
 * traversal that disagreed with the first would put an explanation on screen
 * for a number that came from somewhere else.
 */
export function explainRate(
  kind: RateKind,
  sources: RateSources,
): Array<{ level: RateLevel; cents: number | null; won: boolean }> {
  const winner = resolveRate(kind, sources).level;
  return RATE_LEVELS.map((level) => ({
    level,
    cents: at(sources, level, kind),
    won: level === winner,
  }));
}

/**
 * Does this organization work with two rates?
 *
 * ⚠️ ANSWERED FROM THE DATA, NOT FROM A SETTING. A company that has never
 * entered a cost rate is a one-rate company and should never see a margin
 * column; the day somebody enters one, the column is worth having. Making that
 * a switch means a feature nobody finds, and a support conversation that ends
 * "it was off".
 *
 * Any cost rate anywhere counts, because one is enough to compare against.
 */
export function usesTwoRates(pairs: Array<RatePair | null | undefined>): boolean {
  return pairs.some((p) => p != null && p.costRateCents != null);
}

/**
 * What is left after the hour is paid for.
 *
 * ⚠️ COMPUTED, NEVER STORED. A stored margin is a third number that goes stale
 * the moment either side of it moves, and the first person to notice is the one
 * reading a report that disagrees with the invoice it came from.
 *
 * Null when either side is unknown: a margin against a missing cost is the bill
 * itself, which reads as pure profit and is simply false.
 */
export function marginCents(bill: number | null, cost: number | null): number | null {
  if (bill === null || cost === null) return null;
  return bill - cost;
}

/**
 * What one member's hours come to, at the rates that apply to them.
 *
 * Hours are the caller's business — tracked, typed, or read off a report. This
 * only multiplies, and it rounds ONCE at the end: rounding a rate per line and
 * summing the roundings is how an invoice total misses its own lines by a cent.
 */
export function lineTotals(input: {
  hours: number;
  billRateCents: number | null;
  costRateCents: number | null;
}): { billCents: number | null; costCents: number | null; marginCents: number | null } {
  const h = Number.isFinite(input.hours) && input.hours > 0 ? input.hours : 0;
  const billCents = input.billRateCents === null ? null : Math.round(input.billRateCents * h);
  const costCents = input.costRateCents === null ? null : Math.round(input.costRateCents * h);
  return { billCents, costCents, marginCents: marginCents(billCents, costCents) };
}

/**
 * The rates to WRITE ONTO an invoice line.
 *
 * ⚠️ A LINE CARRIES THE RATE THAT APPLIED ON THE DAY. The ladder answers "what
 * is it now"; an issued invoice has to keep answering "what was it then". Give
 * somebody a raise in June and a paid invoice from March must not move — which
 * it does the instant a screen re-resolves instead of reading what was stored.
 *
 * So the snapshot happens once, at issue, and every later read is of this.
 */
export function snapshotRates(sources: RateSources): {
  billRateCents: number | null;
  costRateCents: number | null;
} {
  return {
    billRateCents: resolveRate('bill', sources).cents,
    costRateCents: resolveRate('cost', sources).cents,
  };
}

/**
 * Take the cost side off anything on its way to somebody who may not see it.
 *
 * ⚠️ WHOEVER RAISES AN INVOICE IS NOT AUTOMATICALLY ENTITLED TO THE MARGIN.
 * `canManageInvoices` is an office job — build the bill, send it, chase it — and
 * what the labour cost the company is a different question, asked by a
 * different person. Bundling them means the first clerk hired can read the
 * company's margin on every job, which is the sort of thing nobody notices
 * until it matters.
 *
 * ⚠️ STRIPPED AT THE BOUNDARY, not hidden in the UI. A field that reaches the
 * browser has been disclosed, whatever the screen chooses to draw — and this
 * one is a number a client must never see beside their own.
 *
 * Deliberately shallow and NAMED: it walks the two lists that carry a rate and
 * nothing else. A clever deep walk over an arbitrary payload is how an
 * unrelated field goes missing; a named list is how a NEW one gets forgotten,
 * so `COST_BEARING_LISTS` is the place to add it and the guard test reads it.
 */
const COST_BEARING_LISTS = ['items', 'workEntries'] as const;

export function stripLabourCost<T>(payload: T, mayViewCost: boolean): T {
  if (mayViewCost || !payload || typeof payload !== 'object') return payload;
  const src = payload as Record<string, unknown>;
  let touched = false;
  const out: Record<string, unknown> = { ...src };

  for (const key of COST_BEARING_LISTS) {
    const list = src[key];
    if (!Array.isArray(list)) continue;
    touched = true;
    out[key] = list.map((line) => {
      if (!line || typeof line !== 'object') return line;
      const { costRateCents, ...rest } = line as Record<string, unknown>;
      void costRateCents;
      return rest;
    });
  }

  /*
    ⚠️ `twoRates` goes too. It is derived FROM cost rates, so leaving it says
    "there is a margin here" to somebody who may not see one — an answer to the
    question they were not allowed to ask.
  */
  if ('twoRates' in out) { out.twoRates = false; touched = true; }

  return (touched ? out : payload) as T;
}

/**
 * A rate as it may be STORED: whole cents, never negative, and bounded.
 *
 * ⚠️ The bound is not fussiness. These arrive from a form, are multiplied by
 * hours, and land in an organization's books — an unbounded integer is a way to
 * put an absurd total on an invoice from a browser, and a fractional cent is a
 * rounding bug waiting for a large one.
 *
 * Returns null for anything unusable, which the ladder reads as "inherit" —
 * the safe direction, because the level above is always a real rate somebody
 * set on purpose.
 */
export const MAX_RATE_CENTS = 1_000_000; // €10,000/hour

export function cleanRateCents(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const whole = Math.round(n);
  if (whole < 0 || whole > MAX_RATE_CENTS) return null;
  return whole;
}
