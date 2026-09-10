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

/** Newest first — the order every timeline is read in. */
export function byNewest(periods: CustodyPeriod[]): CustodyPeriod[] {
  return [...periods].sort((a, b) => ms(b.startedAt) - ms(a.startedAt));
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
): { byPeriod: Map<CustodyPeriod, CustodyTotals>; unattributed: CustodyTotals } {
  const byPeriod = new Map<CustodyPeriod, CustodyTotals>();
  for (const p of periods) byPeriod.set(p, emptyTotals());
  const unattributed = emptyTotals();

  for (const entry of entries) {
    const hits = holdersOn(periods, entry.occurredAt);
    if (hits.length === 0) {
      addTo(unattributed, entry);
      continue;
    }
    /*
      A cost inside two open custodies counts ONCE, against the earliest.

      A machine with a whole shift of operators has several open periods at the
      same instant, so charging every one of them would multiply a €400 repair
      by the size of the shift and quietly inflate the asset's total. The
      earliest is the arbitrary-but-stable choice; what matters is that the sum
      of the parts equals the whole, which is what a person checks.
    */
    const first = hits.sort((a, b) => ms(a.startedAt) - ms(b.startedAt))[0]!;
    // `hits` came out of `periods`, so the bucket always exists — but a
    // fallback that silently threw the entry away would be a total that is
    // quietly short, so it is asserted rather than defaulted.
    const bucket = byPeriod.get(first);
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
): AttributedEntry<T>[] {
  return entries.map((entry) => ({ entry, heldBy: holderOn(periods, entry.occurredAt) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handover
// ─────────────────────────────────────────────────────────────────────────────

export interface HandoverPlan {
  /** Periods this handover would END, and the instant they would end at. */
  closing: CustodyPeriod[];
  /** Parties this handover would give it to. */
  opening: CustodyParty[];
  /** Parties already holding it who simply stay — nothing is written for them. */
  unchanged: CustodyPeriod[];
  /** When it happens. */
  at: Date;
  /**
   * Why the plan cannot be carried out. Empty means it can.
   *
   * Returned rather than thrown so the SCREEN can show the reason beside the
   * date box while the person is still choosing, instead of after they commit.
   * The server calls the same function and refuses on the same list, so the
   * preview and the refusal can never disagree.
   */
  problems: HandoverProblem[];
}

export type HandoverProblem =
  | { kind: 'before-start'; period: CustodyPeriod }
  | { kind: 'future'; at: Date }
  | { kind: 'too-many'; limit: number; asked: number }
  | { kind: 'nobody' };

/**
 * What handing an asset over would actually do — computed once, read twice.
 *
 * The confirm dialog renders this list ("closes Ahmed's custody, opens Mira's")
 * and the service executes exactly it. A separate preview would be a second
 * implementation of the rule, and the two would drift the first time anything
 * changed.
 *
 * @param limit  How many holders the KIND allows. 1 for a van, more for a
 *               machine with a shift on it. A plan that exceeds it is refused
 *               here rather than by a unique index later.
 */
export function planHandover(input: {
  periods: CustodyPeriod[];
  to: CustodyParty[];
  at?: Date | string;
  limit?: number;
  now?: Date;
}): HandoverPlan {
  const now = input.now ?? new Date();
  const at = input.at ? new Date(input.at) : now;
  const problems: HandoverProblem[] = [];

  const open = openPeriods(input.periods);

  // Deduplicated, and blanks dropped: a picker that submits an empty row must
  // not be able to open a period held by nobody.
  const wanted = new Map<string, CustodyParty>();
  for (const p of input.to ?? []) {
    const key = partyKey(p);
    if (!key) continue;
    wanted.set(key, p.userId ? { userId: p.userId } : { customerId: p.customerId });
  }

  const limit = input.limit ?? 1;
  if (limit > 0 && wanted.size > limit) {
    problems.push({ kind: 'too-many', limit, asked: wanted.size });
  }

  const closing = open.filter((p) => !wanted.has(partyKey(p)));
  const unchanged = open.filter((p) => wanted.has(partyKey(p)));
  const opening = [...wanted.entries()]
    .filter(([key]) => !open.some((p) => partyKey(p) === key))
    .map(([, party]) => party);

  if (Number.isNaN(at.getTime())) {
    problems.push({ kind: 'future', at });
  } else {
    /*
      A handover cannot be dated into the future.

      "Ahmed gets it next Monday" reads like a plan and would be stored as a
      fact: for the days in between the asset would have NO holder at all, so
      every receipt in that gap falls out of both custodies and the totals stop
      adding up. Scheduling a future handover is a different feature with a
      different shape, and pretending this one is it is how the data gets wrong.
    */
    if (at.getTime() > now.getTime() + 60_000) problems.push({ kind: 'future', at });

    // Closing a period before it began would store a negative custody, which
    // every reader here would then treat as covering nothing.
    for (const p of closing) {
      if (at.getTime() < ms(p.startedAt)) problems.push({ kind: 'before-start', period: p });
    }
  }

  if (closing.length === 0 && opening.length === 0) problems.push({ kind: 'nobody' });

  return { closing, opening, unchanged, at, problems };
}

/** A plan worth carrying out. */
export function canHandOver(plan: HandoverPlan): boolean {
  return plan.problems.length === 0;
}

/**
 * The parties an asset ends up with after a plan — for the row that has to
 * stay in step with `AssetHolder`.
 */
export function partiesAfter(plan: HandoverPlan): CustodyParty[] {
  return [
    ...plan.unchanged.map((p) => (p.userId ? { userId: p.userId } : { customerId: p.customerId })),
    ...plan.opening,
  ];
}
