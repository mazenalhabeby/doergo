/**
 * A shift's rest totals, from its break ROWS — the one way they are computed.
 *
 * `breakMinutes` (every completed rest — what the screen shows) and
 * `unpaidBreakMinutes` (the ones that do not count as work — what the counted
 * time subtracts) are always RECOMPUTED from the rows, never incremented or
 * decremented: a running total drifts the moment a break is added by hand,
 * deleted or ended by somebody else, and both numbers then look plausible alone.
 *
 * Pure, and structurally typed, so any service — and a test — can hand it rows.
 */

export interface BreakRowLike {
  id?: string;
  startedAt: Date;
  endedAt?: Date | null;
  durationMinutes?: number | null;
  isPaid?: boolean | null;
}

export interface BreakTotals {
  breakMinutes: number;
  unpaidBreakMinutes: number;
}

/**
 * Totals over the COMPLETED rows; a rest still running counts for nothing yet.
 *
 * Summed from the EXACT durations (the two times) and rounded ONCE: rounding
 * each row first let three 20-second taps add up to a minute, or to none,
 * depending on how they fell. A row's stored `durationMinutes` is itself a
 * rounding of those times; it is read only when the times say nothing.
 */
export function breakTotals(rows: readonly BreakRowLike[]): BreakTotals {
  let allMs = 0;
  let unpaidMs = 0;
  for (const b of rows) {
    if (!b.endedAt) continue;
    const span = b.endedAt.getTime() - b.startedAt.getTime();
    const ms = span > 0 ? span : Math.max(0, b.durationMinutes ?? 0) * 60_000;
    allMs += ms;
    if (!b.isPaid) unpaidMs += ms;
  }
  return { breakMinutes: Math.round(allMs / 60_000), unpaidBreakMinutes: Math.round(unpaidMs / 60_000) };
}

/**
 * The rows with every rest still running ended at `at` — what closing a shift
 * does to a rest the member never ended. Never before the rest began (a close
 * earlier than the start makes it zero minutes, not negative). Returns the full
 * list, ended rows carrying their new `endedAt`/`durationMinutes`, plus just the
 * ones that changed, which are what the caller writes.
 */
export function endRunningBreaks<T extends BreakRowLike>(
  rows: readonly T[],
  at: Date,
): { rows: T[]; ended: Array<T & { endedAt: Date; durationMinutes: number }> } {
  const ended: Array<T & { endedAt: Date; durationMinutes: number }> = [];
  const out = rows.map((b) => {
    if (b.endedAt) return b;
    const endedAt = b.startedAt > at ? b.startedAt : at;
    const durationMinutes = Math.round((endedAt.getTime() - b.startedAt.getTime()) / 60_000);
    const row = { ...b, endedAt, durationMinutes };
    ended.push(row);
    return row;
  });
  return { rows: out, ended };
}
