/** The latest readings, and when the next service falls due. */
import type { KindLogType } from '../../access/asset-kind-shape';

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
