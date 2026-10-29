/** Custody as periods: who held it on a day, the days held, and what each period cost. */

import { entryHolder } from './day';

/**
 * Who held a thing, and WHEN.
 *
 * `AssetHolder` answers "who has this now" and nothing else — the row is
 * deleted on a handover, so the moment Ahmed gives the Ford back there is no
 * record that he ever drove it. Every question the business actually asks is
 * about a PERIOD: what did the Ford cost while Ahmed had it, which cars has
 * Ahmed had this year, whose fuel receipt is this.
 *
 * So custody is stored as periods with a start and an end, and the current
 * holder is simply the period that has not ended. One shape answers both
 * questions, and `AssetHolder` stays exactly what it is: a fast index of "now",
 * kept in step by the service that writes a period.
 *
 * ⚠️ THE HOLDER IS NEVER WRITTEN ONTO A COST. Every entry already carries the
 * date the money moved; who held the asset that day is a LOOKUP, computed by
 * `holderOn` below. Storing it too would produce two versions of the truth the
 * first time somebody corrects a handover date — and correcting a handover date
 * is the single most likely repair in this whole feature.
 *
 * Pure and dependency-free on purpose: the phone, the browser and the server
 * all decide the same things, and a rule that runs in one place cannot disagree
 * with itself.
 */

/** Either a member of the organization or one of its clients — never both. */
export interface CustodyParty {
  userId?: string | null;
  customerId?: string | null;
}

/**
 * One stretch of time during which one party held one asset.
 *
 * `endedAt: null` means "still holds it". Nullable rather than a far-future
 * sentinel: a sentinel sorts and compares like a real date, so an off-by-one
 * somewhere renders "held until 9999" to a person, and every query has to
 * remember the magic value.
 */
export interface CustodyPeriod extends CustodyParty {
  id?: string;
  assetId?: string;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  reason?: string | null;
}

/** Anything with a date and an amount — a money entry, in the shape we need it. */
export interface DatedAmount {
  occurredAt: Date | string;
  amountCents: number;
  /** IN or OUT, exactly as `AssetMoney.direction` stores it. */
  direction?: string;
  /** Who logged it. When several people hold it at once, the cost is theirs. */
  authorId?: string | null;
}

const ms = (v: Date | string | null | undefined): number =>
  v == null ? Number.NaN : (v instanceof Date ? v : new Date(v)).getTime();

/**
 * One party, as a comparable string.
 *
 * The two sides are namespaced (`u:` / `c:`) rather than compared field by
 * field, because a member id and a client id are drawn from the same generator
 * and could collide — and a collision here would attribute one person's costs
 * to another.
 */
export function partyKey(p: CustodyParty | null | undefined): string {
  if (!p) return '';
  if (p.userId) return `u:${p.userId}`;
  if (p.customerId) return `c:${p.customerId}`;
  return '';
}

/** True while the period has no end — the party holds the asset right now. */
export function isOpen(period: CustodyPeriod): boolean {
  return period.endedAt == null;
}

/**
 * Does this period cover this instant?
 *
 * Half-open: the start counts, the end does not. That is what makes a handover
 * unambiguous — hand a van over at 09:00 and the 09:00 receipt belongs to the
 * new driver, with no instant belonging to both and none belonging to neither.
 */
export function covers(period: CustodyPeriod, when: Date | string): boolean {
  const t = ms(when);
  if (Number.isNaN(t)) return false;
  const from = ms(period.startedAt);
  if (Number.isNaN(from) || t < from) return false;
  if (period.endedAt == null) return true;
  const to = ms(period.endedAt);
  return !Number.isNaN(to) && t < to;
}

/**
 * Who held it on a given date. Several, when the kind allows several.
 *
 * Returns an array rather than one period so the single case and the shared
 * case are the same code — the mistake `AssetHolder` was built to avoid, and
 * the reason this feature can be added to a shift of operators without a
 * second path.
 */
export function holdersOn(periods: CustodyPeriod[], when: Date | string): CustodyPeriod[] {
  return periods.filter((p) => covers(p, when));
}

/** The one that covers it, when one is enough — the first, in start order. */
export function holderOn(periods: CustodyPeriod[], when: Date | string): CustodyPeriod | null {
  const hits = holdersOn(periods, when).sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
  return hits[0] ?? null;
}

/** Every period still open, i.e. everyone holding it now. */
export function openPeriods(periods: CustodyPeriod[]): CustodyPeriod[] {
  return periods.filter(isOpen);
}

/**
 * How long a period lasted, in whole days, counting today for an open one.
 *
 * Days rather than milliseconds because that is the only unit anybody reads a
 * custody in ("six months on the Ford"), and rounding it at the one place it is
 * computed stops three screens rounding it three ways.
 */
export function custodyDays(period: CustodyPeriod, now: Date = new Date()): number {
  const from = ms(period.startedAt);
  const to = period.endedAt == null ? now.getTime() : ms(period.endedAt);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** What an entry does to a total: money in counts up, money out counts down. */
const signed = (e: DatedAmount): number => {
  const magnitude = Math.abs(Math.round(e.amountCents || 0));
  return e.direction === 'IN' ? magnitude : -magnitude;
};

export interface CustodyTotals {
  inCents: number;
  outCents: number;
  netCents: number;
  entries: number;
}

const emptyTotals = (): CustodyTotals => ({ inCents: 0, outCents: 0, netCents: 0, entries: 0 });

const addTo = (totals: CustodyTotals, e: DatedAmount): void => {
  const magnitude = Math.abs(Math.round(e.amountCents || 0));
  if (e.direction === 'IN') totals.inCents += magnitude;
  else totals.outCents += magnitude;
  totals.netCents += signed(e);
  totals.entries += 1;
};

/**
 * What each period cost, from the dates alone.
 *
 * Linear in the entries and the periods together rather than a filter per
 * period: an asset kept for years has thousands of entries, and the nested form
 * — which is what anybody writes first — walks all of them once per handover.
 *
 * Entries falling in no period are returned under `unattributed`, and that is
 * information rather than an error: an invoice dated before the first handover
 * is real, and hiding it would make a ledger and its breakdown disagree.
 */
export function totalsByPeriod<T extends DatedAmount>(
  entries: T[],
  periods: CustodyPeriod[],
  opts: { timeZone?: string | null } = {},
): { byPeriod: Map<CustodyPeriod, CustodyTotals>; unattributed: CustodyTotals } {
  const byPeriod = new Map<CustodyPeriod, CustodyTotals>();
  for (const p of periods) byPeriod.set(p, emptyTotals());
  const unattributed = emptyTotals();

  for (const entry of entries) {
    /*
      A cost counts ONCE, against ONE holder — `entryHolder` (day.ts): the
      author if they held it that day, else the holder at the instant, else
      whoever held it longest that day.

      A machine with a whole shift of operators has several open periods at the
      same instant, so charging every one of them would multiply a €400 repair
      by the size of the shift. Charging the earliest regardless sent every
      operator's fuel to whoever had been on the machine longest: the sum was
      right and every part of it was wrong.
    */
    const holder = entryHolder(entry, periods, opts.timeZone);
    // A fallback that silently threw the entry away would be a total that is
    // quietly short, so a missing bucket goes to `unattributed`.
    const bucket = holder ? byPeriod.get(holder) : undefined;
    if (bucket) addTo(bucket, entry);
    else addTo(unattributed, entry);
  }

  return { byPeriod, unattributed };
}

/** One entry with the party who held the asset when the money moved. */
export interface AttributedEntry<T> {
  entry: T;
  heldBy: CustodyPeriod | null;
}

/** Tag each entry with its holder — the ledger column, computed not stored. */
export function attribute<T extends DatedAmount>(
  entries: T[],
  periods: CustodyPeriod[],
  opts: { timeZone?: string | null } = {},
): AttributedEntry<T>[] {
  return entries.map((entry) => ({ entry, heldBy: entryHolder(entry, periods, opts.timeZone) }));
}

export { ms };
