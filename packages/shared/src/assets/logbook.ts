/**
 * The logbook — what gets done to a thing, by whom, and when it is due again.
 *
 * A kind names its log types (Fuel, Oil change, Damage — see `KindLogType`);
 * this file holds the three rules every screen and the server must agree on:
 *
 *   · what an entry's values ARE, once checked against its type
 *     (`validateLogValues`) — the form on the phone and the route that stores it
 *     refuse the same answers for the same reasons;
 *   · when a type of work is due again, "after N km or M months, whichever
 *     first" (`computeNextDue`, `dueStatus`), and when that next needs saying
 *     (`nextReminderAt`) — computed on write and stored, so a daily sweep asks
 *     an index rather than recomputing every asset in the organization;
 *   · who SPENT what (`creditsByAuthor`) — the person who logged it, counted
 *     once, never the whole shift that happened to hold the machine that day.
 *
 * Pure and dependency-free, like custody: a rule that runs in one place cannot
 * disagree with itself.
 */

import {
  type KindLogField,
  type KindLogType,
  type KindShape,
  COST_LOG_KEY,
  findMoneyCategory,
} from '../access/asset-kind-shape';

// ─────────────────────────────────────────────────────────────────────────────
// Values
// ─────────────────────────────────────────────────────────────────────────────

/** What one entry's answers are stored as: keyed by FIELD KEY, never by label. */
export type LogValues = Record<string, string | number>;

export type LogValueProblem =
  | { key: string; code: 'required' }
  | { key: string; code: 'not-a-number' }
  | { key: string; code: 'out-of-range' }
  | { key: string; code: 'not-a-date' }
  | { key: string; code: 'not-an-option' }
  | { key: string; code: 'too-long' };

export interface ValidatedLogEntry {
  ok: boolean;
  problems: LogValueProblem[];
  /** Cleaned values — only fields the type declares, photos and money excluded. */
  values: LogValues;
  /** Meter readings in this entry, by meter key — what the asset's "latest" is made of. */
  readings: Record<string, number>;
  /** From the money field. 0 when the type has none or it was left blank. */
  amountCents: number;
  direction: 'IN' | 'OUT';
  /** The ledger heading: the Cost category chosen, else the type's own label. */
  category: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry date — the rule lives in entry-date.ts, shared with expenses
// ─────────────────────────────────────────────────────────────────────────────

/*
  The logbook's names for the one asset-entry date rule. Kept because the
  logbook shipped first under them; new code asks `assetEntryDateProblem`, which
  is the same function and not a copy.
*/
export {
  ASSET_ENTRY_BACKDATE_DAYS as LOG_MEMBER_BACKDATE_DAYS,
  ASSET_ENTRY_FUTURE_GRACE_MS as LOG_FUTURE_GRACE_MS,
  assetEntryDateProblem as logDateProblem,
  type AssetEntryDateProblem as LogDateProblem,
} from './entry-date';

const MAX_TEXT = 500;
/** No real meter or quantity is this large, and a bigger number is a typo that would poison a due date. */
const MAX_NUMBER = 1_000_000_000;
/** €10M. Anything more is not something typed at a pump. */
const MAX_CENTS = 1_000_000_000;

/**
 * A number from what a person typed: "86 412", "12,5", "1.234,50".
 *
 * The same forgiveness a receipt reader needs, because the same people type
 * both. A comma followed by exactly 1–2 digits at the end is a decimal comma;
 * any other comma or space is a thousands separator.
 */
export function readLogNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/[\s\u00a0\u202f']/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  // "86.412" on a German odometer is eighty-six thousand, not eighty-six.
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else s = s.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Check an entry's answers against its type.
 *
 * @param raw       what arrived, keyed by field key
 * @param hasPhoto  whether a photograph came with it — photos travel as an
 *                  uploaded object key beside the values, never inside them
 * @param shape     the kind, for the Cost log's categories
 *
 * Unknown keys are DROPPED, not refused: a phone built against yesterday's
 * version of the kind should still file what the kind still asks for.
 */
export function validateLogValues(
  type: KindLogType,
  raw: unknown,
  opts: { hasPhoto?: boolean; shape?: KindShape } = {},
): ValidatedLogEntry {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const problems: LogValueProblem[] = [];
  const values: LogValues = {};
  const readings: Record<string, number> = {};
  let amountCents = 0;
  let direction: 'IN' | 'OUT' = 'OUT';
  let category = type.label;

  for (const field of type.fields) {
    const v = src[field.key];

    if (field.type === 'photo') {
      if (field.required && !opts.hasPhoto) problems.push({ key: field.key, code: 'required' });
      continue;
    }

    if (blank(v)) {
      if (field.required) problems.push({ key: field.key, code: 'required' });
      continue;
    }

    switch (field.type) {
      case 'text': {
        const s = String(v).trim();
        if (s.length > MAX_TEXT) problems.push({ key: field.key, code: 'too-long' });
        else values[field.key] = s;
        break;
      }
      case 'number': {
        const n = readLogNumber(v);
        if (n === null) problems.push({ key: field.key, code: 'not-a-number' });
        // A meter never runs backwards past zero, and a negative litre is a typo.
        else if (n < 0 || n > MAX_NUMBER) problems.push({ key: field.key, code: 'out-of-range' });
        else {
          values[field.key] = n;
          if (field.meter) readings[field.key] = n;
        }
        break;
      }
      case 'date': {
        const s = String(v).trim();
        // A calendar day, not an instant: the day on a sticker has no time zone.
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null;
        if (!d || d.getUTCMonth() !== +m![2]! - 1) problems.push({ key: field.key, code: 'not-a-date' });
        else values[field.key] = s;
        break;
      }
      case 'choice': {
        const want = String(v).trim().toLowerCase();
        // Stored as the option's own spelling, so "diesel" typed and "Diesel" offered are one answer.
        const hit = (field.options ?? []).find((o) => o.toLowerCase() === want);
        if (!hit) problems.push({ key: field.key, code: 'not-an-option' });
        else values[field.key] = hit;
        break;
      }
      case 'money': {
        const n = typeof v === 'number' ? v : readLogNumber(v);
        // Cents, positive: the direction beside it decides the sign, exactly as the ledger stores it.
        const cents = n === null ? null : Math.abs(Math.round(n));
        if (cents === null) problems.push({ key: field.key, code: 'not-a-number' });
        else if (cents > MAX_CENTS) problems.push({ key: field.key, code: 'out-of-range' });
        else if (cents === 0 && field.required) problems.push({ key: field.key, code: 'required' });
        else {
          amountCents = cents;
          direction = field.direction === 'in' ? 'IN' : 'OUT';
        }
        break;
      }
    }
  }

  /*
    The Cost log's heading decides its direction — Rent comes IN on the same
    form that files a repair going OUT. Every other type files under its own
    label, so a report by heading reads "Fuel", "Oil change" without a mapping.
  */
  if (type.key === COST_LOG_KEY && typeof values.category === 'string') {
    const cat = opts.shape ? findMoneyCategory(opts.shape, values.category) : null;
    category = cat?.label ?? values.category;
    if (cat) direction = cat.direction === 'in' ? 'IN' : 'OUT';
  }

  return { ok: problems.length === 0, problems, values, readings, amountCents, direction, category };
}

/** The meter fields a type records — what its entries can move. */
export function meterFields(type: KindLogType): KindLogField[] {
  return type.fields.filter((f) => f.type === 'number' && f.meter);
}

/**
 * Every meter the kind knows, once each: `odometer` in Fuel and in Service is
 * one reading. The first type to declare it names its label and unit.
 */
export function kindMeters(types: KindLogType[]): Array<{ key: string; label: string; unit?: string }> {
  const seen = new Map<string, { key: string; label: string; unit?: string }>();
  for (const t of types) for (const f of meterFields(t)) if (!seen.has(f.key)) seen.set(f.key, { key: f.key, label: f.label, unit: f.unit });
  return [...seen.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Readings
// ─────────────────────────────────────────────────────────────────────────────

export interface LogReading {
  value: number;
  at: string;
  entryId: string;
}

/** Anything with a date and the readings it carried. */
export interface ReadingSource {
  id: string;
  occurredAt: Date | string;
  readings?: Record<string, number> | null;
}

const ms = (v: Date | string | null | undefined): number =>
  v == null ? Number.NaN : (v instanceof Date ? v : new Date(v)).getTime();

const iso = (v: Date | string): string => (v instanceof Date ? v : new Date(v)).toISOString();

/**
 * The latest reading of each meter: the one with the LATEST DATE, not the
 * largest number.
 *
 * "Largest" is what anybody writes first and it is wrong twice over: a typo of
 * one extra digit would then stand for ever, and correcting it would do
 * nothing. The newest entry is the truth the person last told us.
 */
export function latestReadings(entries: ReadingSource[]): Record<string, LogReading> {
  const out: Record<string, LogReading> = {};
  for (const e of entries) {
    if (!e.readings) continue;
    const t = ms(e.occurredAt);
    if (Number.isNaN(t)) continue;
    for (const [key, value] of Object.entries(e.readings)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const have = out[key];
      if (!have || ms(have.at) < t) out[key] = { value, at: iso(e.occurredAt), entryId: e.id };
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Next due
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calendar months later, clamped: 31 January + 1 month is 28/29 February, not
 * 3 March. A service "every 12 months" from 29 Feb lands on 28 Feb.
 */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Where one type of work stands, as stored on the asset. */
export interface LogDueState {
  /** The log type. */
  key: string;
  /** The entry that started the count — also the reminder's idempotency window. */
  lastEntryId: string;
  lastDoneAt: string;
  /** The meter reading on that entry, when the rule counts units. */
  lastReading: number | null;
  meterKey: string | null;
  /** The date it is due by (months rule). */
  dueAt: string | null;
  /** The reading it is due at (units rule). */
  dueReading: number | null;
  /** When to start saying so, by date. */
  remindAt: string | null;
  /** From which reading to start saying so. */
  remindReading: number | null;
}

/**
 * When a type is next due, from the last time it was done.
 *
 * Returns null when the type has no rule, or has NEVER been logged. Never-done
 * is deliberately not "due now": a van bought at 86,000 km with no oil change
 * on record would otherwise announce itself 71,000 km overdue on the day the
 * logbook is switched on, to everyone, for every type — and a reminder that
 * cries wolf on day one is a reminder nobody reads on day ninety.
 */
export function computeNextDue(
  type: KindLogType,
  last: { id: string; occurredAt: Date | string; readings?: Record<string, number> | null } | null,
): LogDueState | null {
  if (!type.due || !last) return null;
  const doneAt = new Date(last.occurredAt);
  if (Number.isNaN(doneAt.getTime())) return null;
  const rule = type.due;

  let dueAt: Date | null = null;
  let remindAt: Date | null = null;
  if (rule.months) {
    dueAt = addMonths(doneAt, rule.months);
    remindAt = new Date(dueAt.getTime() - (rule.leadDays ?? 0) * 86_400_000);
  }

  let lastReading: number | null = null;
  let dueReading: number | null = null;
  let remindReading: number | null = null;
  if (rule.units && rule.meterKey) {
    const r = last.readings?.[rule.meterKey];
    /*
      No reading on the entry, no unit count. Guessing "from the asset's reading
      at the time" would start the count from a number nobody typed on THIS job,
      and a due mileage built on a guess is worse than asking for the reading —
      which is why a template marks the meter required on a type that counts.
    */
    if (typeof r === 'number' && Number.isFinite(r)) {
      lastReading = r;
      dueReading = r + rule.units;
      remindReading = dueReading - (rule.leadUnits ?? 0);
    }
  }

  if (!dueAt && dueReading === null) return null;

  return {
    key: type.key,
    lastEntryId: last.id,
    lastDoneAt: doneAt.toISOString(),
    lastReading,
    meterKey: dueReading !== null ? rule.meterKey : null,
    dueAt: dueAt?.toISOString() ?? null,
    dueReading,
    remindAt: remindAt?.toISOString() ?? null,
    remindReading,
  };
}

export type DueStage = 'ok' | 'soon' | 'overdue';

export interface DueStatus {
  stage: DueStage;
  /**
   * How far through the interval, 0…1 (and beyond once overdue): whichever of
   * time and units is further along, because that is the one that will trip.
   */
  progress: number;
  /** Days until the due date; negative once past. Null without a months rule. */
  daysLeft: number | null;
  /** Units until the due reading; negative once past. Null without a units rule or a reading. */
  unitsLeft: number | null;
}

/**
 * Where a type stands NOW — "whichever first", applied to the stage too:
 * overdue if EITHER limit is past, soon if either lead has begun.
 */
export function dueStatus(state: LogDueState, currentReading: number | null | undefined, now: Date = new Date()): DueStatus {
  const t = now.getTime();
  let overdue = false;
  let soon = false;
  let progress = 0;
  let daysLeft: number | null = null;
  let unitsLeft: number | null = null;

  if (state.dueAt) {
    const due = ms(state.dueAt);
    const start = ms(state.lastDoneAt);
    const days = (due - t) / 86_400_000;
    // "Due in 1 day" until it is due; "1 day overdue" from the first hour past.
    daysLeft = days >= 0 ? Math.ceil(days) : Math.floor(days);
    if (t >= due) overdue = true;
    else if (state.remindAt && t >= ms(state.remindAt)) soon = true;
    if (due > start) progress = Math.max(progress, (t - start) / (due - start));
  }

  if (state.dueReading !== null && state.lastReading !== null && typeof currentReading === 'number') {
    unitsLeft = state.dueReading - currentReading;
    if (currentReading >= state.dueReading) overdue = true;
    else if (state.remindReading !== null && currentReading >= state.remindReading) soon = true;
    const span = state.dueReading - state.lastReading;
    if (span > 0) progress = Math.max(progress, (currentReading - state.lastReading) / span);
  }

  return {
    stage: overdue ? 'overdue' : soon ? 'soon' : 'ok',
    progress: Math.max(0, progress),
    daysLeft,
    unitsLeft,
  };
}

/**
 * The next moment the sweep should look at this asset again, strictly after
 * `after`. Null when time alone will change nothing.
 *
 * Only DATES can move a stage while nobody writes anything; a reading only
 * moves when an entry is saved, and saving recomputes this anyway. So the
 * candidates are each type's remind date and due date still in the future.
 */
export function nextReminderAt(states: LogDueState[], after: Date): Date | null {
  let best: number | null = null;
  const a = after.getTime();
  for (const s of states) {
    for (const v of [s.remindAt, s.dueAt]) {
      const t = ms(v);
      if (!Number.isNaN(t) && t > a && (best === null || t < best)) best = t;
    }
  }
  return best === null ? null : new Date(best);
}

/**
 * What to store as the asset's next look, right after a write.
 *
 * Something already soon or overdue gets looked at NOW — the sweep dedupes by
 * window and stage, so an entry saved twice does not tell anybody twice.
 */
export function remindAtAfterWrite(
  states: LogDueState[],
  readings: Record<string, LogReading>,
  now: Date = new Date(),
): Date | null {
  for (const s of states) {
    if (dueStatus(s, s.meterKey ? readings[s.meterKey]?.value : null, now).stage !== 'ok') return now;
  }
  return nextReminderAt(states, now);
}

/** What the asset stores: computed on every write, read by every screen and the sweep. */
export interface AssetLogState {
  readings: Record<string, LogReading>;
  due: LogDueState[];
  computedAt: string;
}

export function readLogState(raw: unknown): AssetLogState {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const readings = (src.readings && typeof src.readings === 'object' ? src.readings : {}) as Record<string, LogReading>;
  const due = Array.isArray(src.due) ? (src.due as LogDueState[]) : [];
  return { readings, due, computedAt: typeof src.computedAt === 'string' ? src.computedAt : '' };
}

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
