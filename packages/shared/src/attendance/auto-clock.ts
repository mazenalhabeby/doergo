/**
 * AUTOMATIC CLOCK-IN AND CLOCK-OUT — decided on the phone, offline, with the
 * same rules the server repeats.
 *
 * For workplaces where people forget to clock (a factory hall with no signal).
 * The phone's OS geofence wakes the app on entering and leaving a workspace,
 * even when it is closed; the phone decides with these pure functions plus the
 * existing local clock-in check (`checkClockInLocally`), files the step in its
 * offline outbox with the REAL moment it happened, and the server re-checks it
 * on arrival. Nothing here needs a connection.
 *
 * ⚠️ OPT-IN TWICE: the workspace switches it on and picks the members, AND each
 * member consents in the app (location-based control — ArbVG §96 needs a works
 * council agreement or the person's consent). No consent, no arming.
 *
 * ⚠️ THE MOMENT RECORDED IS WHEN IT HAPPENED: arrival = when they entered the
 * area; departure = when they left it. Never the moment a timer ran out —
 * counted time already starts at the shift start, so an early arrival adds
 * nothing.
 *
 * ⚠️ AN AUTOMATIC STEP IS MARKED, NOT SUSPECTED: AUTO_CLOCK_IN / AUTO_CLOCK_OUT
 * are informational (approved on arrival when nothing else needs a person).
 * Everything that sends a manual clock-in to review still does.
 */

/** Per-workspace settings. */
export interface AutoClockSettings {
  enabled: boolean;
  /** Auto clock-in only from this many minutes before the shift starts. */
  leadMinutes: number;
  /** …and only after staying inside this long (a drive-past is not an arrival). */
  dwellMinutes: number;
  /** After the shift's end, leaving the area clocks out once outside this long. */
  exitGraceMinutes: number;
  /** A rest started automatically mid-shift when none was taken (null = off). */
  autoRestMinutes: number | null;
  /** Still inside after the end: the leader is told after this many minutes (online). */
  leaderAfterMinutes: number;
  /** Nobody answered: the server closes the shift (provisionally) after this many minutes. */
  closeAfterMinutes: number;
}

export const AUTO_CLOCK_DEFAULTS: AutoClockSettings = {
  enabled: false,
  leadMinutes: 30,
  dwellMinutes: 3,
  exitGraceMinutes: 10,
  autoRestMinutes: null,
  leaderAfterMinutes: 25,
  closeAfterMinutes: 60,
};

export const AUTO_CLOCK_LIMITS = {
  leadMinutes: [0, 180],
  dwellMinutes: [0, 30],
  exitGraceMinutes: [0, 60],
  autoRestMinutes: [10, 120],
  leaderAfterMinutes: [5, 240],
  closeAfterMinutes: [15, 720],
} as const;

export type AutoClockSettingsError = 'AUTO_CLOCK_SETTING_INVALID';

/**
 * Read stored or submitted settings. Stored: missing fields take the defaults.
 * Submitted (`strict`): an out-of-range number is refused, never clamped —
 * the office should see that 500 minutes was not saved as 180.
 */
export function parseAutoClockSettings(
  raw: unknown,
  opts: { strict?: boolean } = {},
): { ok: true; value: AutoClockSettings } | { ok: false; code: AutoClockSettingsError; field: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: AutoClockSettings = { ...AUTO_CLOCK_DEFAULTS, enabled: b.enabled === true };
  for (const [field, [min, max]] of Object.entries(AUTO_CLOCK_LIMITS) as [keyof typeof AUTO_CLOCK_LIMITS, readonly [number, number]][]) {
    const v = b[field];
    if (v === undefined) continue;
    if (field === 'autoRestMinutes' && v === null) {
      out.autoRestMinutes = null;
      continue;
    }
    const n = typeof v === 'number' && Number.isInteger(v) ? v : NaN;
    if (!(n >= min && n <= max)) {
      if (opts.strict) return { ok: false, code: 'AUTO_CLOCK_SETTING_INVALID', field };
      continue;
    }
    (out as unknown as Record<string, number | null>)[field] = n;
  }
  if (out.closeAfterMinutes <= out.leaderAfterMinutes) {
    if (opts.strict) return { ok: false, code: 'AUTO_CLOCK_SETTING_INVALID', field: 'closeAfterMinutes' };
    out.closeAfterMinutes = Math.max(AUTO_CLOCK_DEFAULTS.closeAfterMinutes, out.leaderAfterMinutes + 15);
  }
  return { ok: true, value: out };
}

/* ------------------------------------------------------------------ arrival */

export type AutoClockInDecision =
  | { action: 'CLOCK_IN'; at: Date }
  /** Inside, but not long enough yet / too early for the window — look again then. */
  | { action: 'WAIT'; until: Date }
  | { action: 'SKIP'; reason: 'NO_SHIFT' | 'SHIFT_OVER' | 'ALREADY_CLOCKED_IN' | 'NOT_INSIDE' | 'OFF' };

/**
 * Should the phone clock this member in, given when they entered the area?
 *
 * Window: from `leadMinutes` before the shift's start until its end (an
 * arrival after the end is not a shift). Dwell: they must have been inside
 * `dwellMinutes` by `now`. The recorded moment is the entry, or the window's
 * opening when they were already inside before it opened (sat in the car park
 * at 06:50 for an 08:00 shift with a 30-minute lead → 07:30).
 */
export function decideAutoClockIn(input: {
  settings: AutoClockSettings;
  now: Date;
  enteredAt: Date | null;
  stillInside: boolean;
  shiftStart: Date | null;
  shiftEnd: Date | null;
  alreadyClockedIn: boolean;
}): AutoClockInDecision {
  const { settings: s, now } = input;
  if (!s.enabled) return { action: 'SKIP', reason: 'OFF' };
  if (input.alreadyClockedIn) return { action: 'SKIP', reason: 'ALREADY_CLOCKED_IN' };
  if (!input.shiftStart || !input.shiftEnd) return { action: 'SKIP', reason: 'NO_SHIFT' };
  if (!input.stillInside || !input.enteredAt) return { action: 'SKIP', reason: 'NOT_INSIDE' };
  if (now.getTime() >= input.shiftEnd.getTime()) return { action: 'SKIP', reason: 'SHIFT_OVER' };
  const opens = new Date(input.shiftStart.getTime() - s.leadMinutes * 60_000);
  const arrival = input.enteredAt.getTime() > opens.getTime() ? input.enteredAt : opens;
  const ready = new Date(arrival.getTime() + s.dwellMinutes * 60_000);
  if (now.getTime() < ready.getTime()) return { action: 'WAIT', until: ready };
  return { action: 'CLOCK_IN', at: arrival };
}

/* ------------------------------------------------------------------ departure */

export type AutoClockOutDecision =
  | { action: 'CLOCK_OUT'; at: Date }
  | { action: 'WAIT'; until: Date }
  /** Left before the end: that is an excursion (the existing flow), not a departure. */
  | { action: 'SKIP'; reason: 'NOT_CLOCKED_IN' | 'BEFORE_END' | 'BACK_INSIDE' | 'OFF' };

/**
 * Should leaving the area clock this member out? Only a departure after the
 * planned end counts, once they have stayed outside `exitGraceMinutes` (a
 * walk to the van is not going home). The moment recorded is when they left.
 */
export function decideAutoClockOut(input: {
  settings: AutoClockSettings;
  now: Date;
  exitedAt: Date;
  stillOutside: boolean;
  plannedEnd: Date | null;
  clockedIn: boolean;
}): AutoClockOutDecision {
  const { settings: s, now } = input;
  if (!s.enabled) return { action: 'SKIP', reason: 'OFF' };
  if (!input.clockedIn) return { action: 'SKIP', reason: 'NOT_CLOCKED_IN' };
  if (!input.stillOutside) return { action: 'SKIP', reason: 'BACK_INSIDE' };
  if (!input.plannedEnd || input.exitedAt.getTime() < input.plannedEnd.getTime()) return { action: 'SKIP', reason: 'BEFORE_END' };
  const ready = new Date(input.exitedAt.getTime() + s.exitGraceMinutes * 60_000);
  if (now.getTime() < ready.getTime()) return { action: 'WAIT', until: ready };
  return { action: 'CLOCK_OUT', at: input.exitedAt };
}

/* ------------------------------------------------------------------ rest */

/** Austrian AZG §11: a rest is owed once the day is longer than six hours. */
export const AUTO_REST_AFTER_MINUTES = 360;

/**
 * The automatic rest for a shift: centred in the middle of the planned shift,
 * only when the shift is longer than six hours, no rest has been taken, and the
 * workspace switched it on. The phone starts it with a "Still working?" button
 * that cancels it — it is never deducted silently.
 */
export function autoRestPlan(input: {
  settings: AutoClockSettings;
  shiftStart: Date | null;
  shiftEnd: Date | null;
  restTaken: boolean;
}): { startAt: Date; endAt: Date } | null {
  const m = input.settings.autoRestMinutes;
  if (!input.settings.enabled || !m || input.restTaken || !input.shiftStart || !input.shiftEnd) return null;
  const length = (input.shiftEnd.getTime() - input.shiftStart.getTime()) / 60_000;
  if (length <= AUTO_REST_AFTER_MINUTES || m >= length) return null;
  const mid = input.shiftStart.getTime() + (length / 2) * 60_000;
  const startAt = new Date(Math.round((mid - (m / 2) * 60_000) / 60_000) * 60_000);
  return { startAt, endAt: new Date(startAt.getTime() + m * 60_000) };
}

/* ------------------------------------------------------------------ marking */

/** Informational flags (never send an entry to review on their own). */
export const AUTO_CLOCK_IN_FLAG = 'AUTO_CLOCK_IN';
export const AUTO_CLOCK_OUT_FLAG = 'AUTO_CLOCK_OUT';
export const AUTO_REST_FLAG = 'AUTO_REST';

/** How long after an automatic clock-in its owner may undo it (a drive-past). */
export const AUTO_CLOCK_UNDO_MINUTES = 10;

/** What a clock step says about how it was made — sent by the phone, re-checked by the server. */
export const CLOCK_TRIGGERS = ['MANUAL', 'AUTO'] as const;
export type ClockTrigger = (typeof CLOCK_TRIGGERS)[number];
