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

export {
  type LogValues,
  type LogValueProblem,
  type ValidatedLogEntry,
  readLogNumber,
  validateLogValues,
  meterFields,
  kindMeters,
} from './logbook/values';
export {
  type LogReading,
  type ReadingSource,
  latestReadings,
  addMonths,
  type LogDueState,
  computeNextDue,
  type DueStage,
  type DueStatus,
  dueStatus,
  nextReminderAt,
  remindAtAfterWrite,
  type AssetLogState,
  readLogState,
} from './logbook/due';
export { type CreditableEntry, type Credit, creditsByAuthor, creditsByLogType, logValueLines } from './logbook/credits';
