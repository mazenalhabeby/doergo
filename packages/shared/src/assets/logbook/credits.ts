/** Who spent what, by author and by kind of entry, and an entry's values as lines. */
import { COST_LOG_KEY, type KindLogType } from '../../access/asset-kind-shape';

// ─────────────────────────────────────────────────────────────────────────────
// Who spent what
// ─────────────────────────────────────────────────────────────────────────────

export interface CreditableEntry {
  authorId?: string | null;
  amountCents: number;
  direction?: string;
  logType?: string | null;
}

export interface Credit {
  inCents: number;
  outCents: number;
  netCents: number;
  entries: number;
}

const emptyCredit = (): Credit => ({ inCents: 0, outCents: 0, netCents: 0, entries: 0 });

const credit = (c: Credit, e: CreditableEntry) => {
  const m = Math.abs(Math.round(e.amountCents || 0));
  if (e.direction === 'IN') {
    c.inCents += m;
    c.netCents += m;
  } else {
    c.outCents += m;
    c.netCents -= m;
  }
  c.entries += 1;
};

/**
 * What each PERSON logged, counted once.
 *
 * Credited to the author — the person who stood at the pump — rather than to
 * whoever held the asset. On a machine run by a shift, "held it that day" is
 * five people, and charging all five multiplies a €400 repair by five, while
 * charging the earliest (what custody totals used to do) sends the whole
 * shift's fuel to one operator. The author is one person and was there.
 *
 * Entries with no author (typed before authors were kept, or by a member since
 * removed) are returned under `''` rather than dropped: a breakdown whose parts
 * do not add up to its whole is the first thing anybody checks.
 */
export function creditsByAuthor(entries: CreditableEntry[]): Map<string, Credit> {
  const out = new Map<string, Credit>();
  for (const e of entries) {
    const key = e.authorId ?? '';
    let c = out.get(key);
    if (!c) out.set(key, (c = emptyCredit()));
    credit(c, e);
  }
  return out;
}

/** The same, by log type — `cost` for the ledger's own entries (and every entry older than the logbook). */
export function creditsByLogType(entries: CreditableEntry[]): Map<string, Credit> {
  const out = new Map<string, Credit>();
  for (const e of entries) {
    const key = e.logType || COST_LOG_KEY;
    let c = out.get(key);
    if (!c) out.set(key, (c = emptyCredit()));
    credit(c, e);
  }
  return out;
}

/**
 * A logbook entry's answers as lines a person reads — "Hour meter: 1,290 h" —
 * in the TYPE's order and words. A value whose field the kind has since
 * removed is still shown under its key: it is history, and hiding it would
 * make an entry look emptier than what was written. Photos and money are left
 * out (shown on their own), and a cost's heading is already its title.
 *
 * One rule for the web's logbook and the phone's register.
 */
export function logValueLines(
  entry: { logType?: string | null; values?: Record<string, string | number> | null },
  type: Pick<KindLogType, 'fields'> | null | undefined,
  formatNumber: (n: number) => string = (n) => n.toLocaleString(),
): string[] {
  const values = entry.values ?? {};
  const fields = type?.fields ?? [];
  return [
    ...fields
      .filter(
        (f) =>
          f.type !== 'photo' &&
          f.type !== 'money' &&
          values[f.key] !== undefined &&
          !(entry.logType === 'cost' && f.key === 'category'),
      )
      .map((f) => {
        const v = values[f.key]!;
        const text = typeof v === 'number' ? formatNumber(v) : v;
        return `${f.label}: ${text}${f.unit ? ` ${f.unit}` : ''}`;
      }),
    ...Object.entries(values)
      .filter(([k]) => !fields.some((f) => f.key === k))
      .map(([k, v]) => `${k}: ${v}`),
  ];
}
