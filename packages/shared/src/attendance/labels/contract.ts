/**
 * The attendance labels' contract — the codes, and the facts an entry keeps so
 * every label it carries can be worked out again and explained.
 *
 * Plan: docs/plans/clock-attendance-2026-10.md. Server rules, the catalogue
 * (words, tone, review or info), the explanation and every screen build on
 * these types; nothing defines a label code or a fact anywhere else.
 *
 * ⚠️ THE PAST IS NOT TOUCHED. An entry written before these rules has
 * `labelRules = null` and keeps today's behaviour in every path (edits
 * included). Only entries stamped with LABEL_RULES_VERSION follow the rules
 * built on this contract, and only they carry `labelFacts`.
 */

/** Stamped on every entry created under the current label rules. Raise it when a rule changes meaning. */
export const LABEL_RULES_VERSION = 1;

/** Every label code an entry can carry (`TimeEntry.flagReasons`). */
export const LABEL_CODES = [
  // When — against the shift
  'LATE_ARRIVAL',
  'LATE_FROM_REST',
  'EARLY_DEPARTURE',
  'OVERTIME',
  'PAST_DAILY_LIMIT',
  'UNSCHEDULED_DAY',
  // Closing
  'MISSED_CLOCK_OUT',
  'CLOCK_OUT_PROVISIONAL',
  // Where
  'OUTSIDE_GEOFENCE_IN',
  'OUTSIDE_GEOFENCE_OUT',
  'REMOTE_WITH_WORKSPACE',
  'APPROVED_REMOTE',
  'BOUNDARY_CHANGED',
  // Rests
  'MISSED_BREAK',
  'AUTO_REST',
  // How it was recorded
  'RECORDED_OFFLINE',
  'UNANCHORED',
  'CLOCK_SUSPECT',
  'STALE',
  'FIX_MOCKED',
  'AUTO_CLOCK_IN',
  'AUTO_CLOCK_OUT',
] as const;

export type LabelCode = (typeof LABEL_CODES)[number];

export function isLabelCode(value: unknown): value is LabelCode {
  return typeof value === 'string' && (LABEL_CODES as readonly string[]).includes(value);
}

/** How a shift came to be closed — always recorded for new entries. */
export type ClosedHow =
  | 'CLOCKED_OUT' // the person tapped (or the phone filed) a clock-out
  | 'AUTO_CLOCK_OUT' // the automatic clock, accepted by the server
  | 'LEFT_SITE' // temporary close at the moment they were seen leaving
  | 'LAST_SEEN' // temporary close at the last moment seen on site
  | 'SHIFT_END' // temporary close at the planned end
  | 'SESSION_HOURS' // temporary close at clock-in + the workspace's hours
  | 'CONFIRMED' // the person answered "I forgot to clock out" with a time
  | 'OVERTIME_DECISION' // closed because extra time was refused or not confirmed
  | 'OFFICE'; // closed by an office edit

/** A position judged against the site. `judged: false` when there was no fix or it was too coarse. */
export interface PositionFact {
  judged: boolean;
  /** Metres outside the site after accuracy is allowed for; 0 = on site. Absent when not judged. */
  metresOutside?: number;
  accuracyM?: number | null;
  /** Why it was not judged. */
  notJudgedBecause?: 'NO_FIX' | 'TOO_COARSE' | 'NO_SITE' | 'AWAY_DAY' | 'AUTO_CLOCK_OUT';
}

/**
 * What an entry was compared against — enough to work every label out again
 * and to explain it in words. Times are ISO strings; minutes are whole numbers.
 * Never holds coordinates: an explanation must not reveal a position.
 */
export interface LabelFacts {
  /** The shift instance the clock-in was matched to, or null (no shift that day). */
  shift: {
    id: string | null;
    name: string | null;
    expectedStartAt: string;
    expectedEndAt: string | null;
    /** The grace used, frozen — a later change to the shift does not move an old judgement. */
    toleranceMin: number;
    /** The planned end is a daily allowance (no-shift LIMIT), not a shift end. */
    endIsDailyLimit: boolean;
  } | null;
  /** True for the first entry of this shift instance — only the first can be LATE_ARRIVAL. */
  firstOfShift: boolean;
  /** When the person came back after a rest (gap between entries of one shift, or a break row). */
  rest?: {
    plannedMin: number;
    takenMin: number;
    /** Minutes over planned + grace; > 0 means LATE_FROM_REST. */
    overMin: number;
  };
  clockIn: PositionFact;
  clockOut?: PositionFact;
  closedHow?: ClosedHow;
  /** The workspace's boundary changed between the tap and its arrival (offline only). */
  boundaryChangedSinceTap?: boolean;
  /**
   * Clock-ins that JOINED this entry instead of opening a second one (one entry
   * per shift): their phone-made ids, so a resend of one is answered with this entry.
   */
  joinedClockInIds?: string[];
}
