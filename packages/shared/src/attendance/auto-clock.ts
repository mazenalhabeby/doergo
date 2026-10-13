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

import { addDaysStr, localPartsIn, zonedWallTimeToUtc } from './zoned-time';
import { clampDailyMinutes, isNoShiftPolicy } from './no-shift-limit';

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

/** Stored settings as every reader takes them: never fails, defaults filled in, an out-of-range value ignored. */
export function readAutoClockSettings(raw: unknown): AutoClockSettings {
  const parsed = parseAutoClockSettings(raw);
  return parsed.ok ? parsed.value : { ...AUTO_CLOCK_DEFAULTS };
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

/* ------------------------------------------------------------------ no fixed shift */

/**
 * How the automatic clock decides for one member in one workspace.
 *
 * SHIFT — by the planned shift (the rules above). Needs a rota.
 * PRESENCE — by arriving and leaving, for people with no fixed shift (called
 * in, 8 hours one day and 10 the next). On a day they DO have a shift there,
 * the shift's rules still apply.
 */
export const AUTO_CLOCK_MODES = ['SHIFT', 'PRESENCE'] as const;
export type AutoClockMode = (typeof AUTO_CLOCK_MODES)[number];

export function isAutoClockMode(v: unknown): v is AutoClockMode {
  return typeof v === 'string' && (AUTO_CLOCK_MODES as readonly string[]).includes(v);
}

/** The local hours an arrival starts work on its own ("HH:MM", may cross midnight). */
export interface AutoClockStartWindow {
  from: string;
  to: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (hhmm: string) => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/**
 * A start window as submitted or stored. null / undefined = any time. Submitted
 * (`strict`) a malformed one is refused, never read as "any time" — that would
 * silently remove the guard the office meant to set.
 */
export function parseAutoClockStartWindow(
  raw: unknown,
  opts: { strict?: boolean } = {},
): { ok: true; value: AutoClockStartWindow | null } | { ok: false; code: AutoClockSettingsError; field: 'startWindow' } {
  if (raw == null) return { ok: true, value: null };
  const b = typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const from = typeof b.from === 'string' ? b.from : '';
  const to = typeof b.to === 'string' ? b.to : '';
  if (HHMM.test(from) && HHMM.test(to) && from !== to) return { ok: true, value: { from, to } };
  return opts.strict ? { ok: false, code: 'AUTO_CLOCK_SETTING_INVALID', field: 'startWindow' } : { ok: true, value: null };
}

/** A stored start window as every reader takes it: never fails, a malformed one reads as any time. */
export function readAutoClockStartWindow(raw: unknown): AutoClockStartWindow | null {
  const r = parseAutoClockStartWindow(raw);
  return r.ok ? r.value : null;
}

/**
 * The automatic clock as it applies to ONE member at one workspace: the
 * workspace's settings, plus how this member is clocked, plus the workspace's
 * "hours without a shift" — read live, so changing it on the workspace changes
 * it for everybody at once, running sessions included.
 */
export interface MemberAutoClockSettings extends AutoClockSettings {
  mode: AutoClockMode;
  startWindow: AutoClockStartWindow | null;
  /** The longest session without a shift: the workspace's own hours (`noShiftDailyMinutes`). */
  noShiftMinutes: number;
  /** The workspace allows only up to those hours a day (LIMIT): past them counts only as approved overtime. */
  noShiftLimit: boolean;
}

/** One window instance as instants: the one holding `at`, in the workspace's zone; null when `at` is outside it. */
export function startWindowAround(window: AutoClockStartWindow, tz: string, at: Date): { start: Date; end: Date } | null {
  const from = minutesOf(window.from);
  const to = minutesOf(window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return null;
  const length = ((to - from + 1440) % 1440) * 60_000;
  const today = localPartsIn(at, tz).dateStr;
  // The window may have opened yesterday (19:00–03:00 holds 01:00).
  for (const day of [addDaysStr(today, -1), today]) {
    const start = zonedWallTimeToUtc(day, Math.floor(from / 60), from % 60, tz);
    const end = new Date(start.getTime() + length);
    if (start.getTime() <= at.getTime() && at.getTime() < end.getTime()) return { start, end };
  }
  return null;
}

export type PresenceClockInDecision =
  | AutoClockInDecision
  /** Arrived outside their usual hours: the phone asks them instead of clocking in. */
  | { action: 'ASK' };

/**
 * PRESENCE: should arriving clock this member in? Inside their usual hours (or
 * any time when none are set), after the same dwell as a shift — the same
 * `decideAutoClockIn`, with the usual hours as the window and no lead. Outside
 * them, ASK. The recorded moment is the arrival.
 */
export function decidePresenceClockIn(input: {
  settings: MemberAutoClockSettings;
  now: Date;
  enteredAt: Date | null;
  stillInside: boolean;
  timezone: string;
  alreadyClockedIn: boolean;
}): PresenceClockInDecision {
  const { settings: s } = input;
  if (!s.enabled) return { action: 'SKIP', reason: 'OFF' };
  if (input.alreadyClockedIn) return { action: 'SKIP', reason: 'ALREADY_CLOCKED_IN' };
  if (!input.stillInside || !input.enteredAt) return { action: 'SKIP', reason: 'NOT_INSIDE' };
  const window = s.startWindow
    ? startWindowAround(s.startWindow, input.timezone, input.enteredAt)
    : { start: input.enteredAt, end: new Date(input.enteredAt.getTime() + 86_400_000) };
  if (!window) return { action: 'ASK' };
  return decideAutoClockIn({
    settings: { ...s, leadMinutes: 0 },
    now: input.now,
    enteredAt: input.enteredAt,
    stillInside: true,
    shiftStart: window.start,
    // Only the ARRIVAL must fall inside the usual hours; the dwell, and a phone
    // that wakes later, may run past their close.
    shiftEnd: new Date(input.enteredAt.getTime() + 86_400_000),
    alreadyClockedIn: false,
  });
}

/**
 * When a session with no shift has run its course: clock-in + the workspace's
 * hours. Where the phone asks "Still working?", the leader is told after it,
 * and an absence after it closes the session for review.
 */
export function presenceSessionEnd(clockInAt: Date, settings: Pick<MemberAutoClockSettings, 'noShiftMinutes'>): Date {
  return new Date(clockInAt.getTime() + settings.noShiftMinutes * 60_000);
}

/**
 * SERVER: is a session clocked by arriving and leaving due to be closed for
 * review? Only past its course (clock-in + the workspace's hours) + the
 * workspace's `closeAfterMinutes`, AND only with evidence the person is gone:
 * seen leaving, the phone reporting them off site, or the phone silent that
 * long. A phone still reporting them on site means they are working — the
 * leader has been told; nobody is clocked out for being there.
 */
export function presenceCloseDue(input: {
  clockInAt: Date;
  settings: Pick<MemberAutoClockSettings, 'noShiftMinutes' | 'closeAfterMinutes'>;
  now: Date;
  /** An open excursion: when they were seen leaving. */
  leftSiteAt: Date | null;
  /** The last position heard (`TimeEntry.lastSeenAt`) and where it put them (`presence`). */
  lastSeenAt: Date | null;
  presence: string | null;
}): { due: boolean; lastSeenOnSiteAt: Date | null } {
  const graceMs = input.settings.closeAfterMinutes * 60_000;
  const lastSeenOnSiteAt = input.presence === 'ON_SITE' ? input.lastSeenAt : null;
  if (input.now.getTime() < presenceSessionEnd(input.clockInAt, input.settings).getTime() + graceMs) return { due: false, lastSeenOnSiteAt };
  const silent = !input.lastSeenAt || input.now.getTime() - input.lastSeenAt.getTime() >= graceMs;
  const gone = !!input.leftSiteAt || input.presence !== 'ON_SITE' || silent;
  return { due: gone, lastSeenOnSiteAt };
}

/**
 * Is this entry clocked by arriving and leaving? The member's mode is PRESENCE
 * and the entry matched no planned shift (`expectedClockInAt` is set only by a
 * shift). On a rota day the shift's rules apply, as for anyone.
 */
export function clocksByPresence(settings: Pick<MemberAutoClockSettings, 'mode'> | null | undefined, entry: { expectedClockInAt?: Date | string | null }): boolean {
  return settings?.mode === 'PRESENCE' && !entry.expectedClockInAt;
}

/**
 * The usual start window from past clock-ins (local minutes of the day): the
 * shortest arc of the clock holding them all, an hour wider each side, on the
 * half hour. Fewer than five, or spread over most of the day → null (any time).
 * Circular, so starts at 23:30 and 00:30 make a one-hour window, not a day.
 */
export const START_WINDOW_MIN_SAMPLES = 5;
export function suggestStartWindow(localMinutes: readonly number[]): AutoClockStartWindow | null {
  const xs = [...new Set(localMinutes.filter((m) => Number.isFinite(m)).map((m) => ((Math.round(m) % 1440) + 1440) % 1440))].sort((a, b) => a - b);
  if (localMinutes.length < START_WINDOW_MIN_SAMPLES || !xs.length) return null;
  // The widest gap between neighbours (wrapping) is what the window leaves out.
  let gapAfter = xs.length - 1;
  let gap = xs[0]! + 1440 - xs[xs.length - 1]!;
  for (let i = 0; i < xs.length - 1; i++) {
    const g = xs[i + 1]! - xs[i]!;
    if (g > gap) {
      gap = g;
      gapAfter = i;
    }
  }
  const first = xs[(gapAfter + 1) % xs.length]!;
  const last = xs[gapAfter]!;
  const span = (last - first + 1440) % 1440;
  if (span + 120 >= 20 * 60) return null;
  const from = (Math.floor((first - 60) / 30) * 30 + 1440) % 1440;
  const to = (Math.ceil((last + 60) / 30) * 30) % 1440;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { from: hhmm(from), to: hhmm(to) };
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

/* ------------------------------------------------------------------ API */

/**
 * One workspace the phone arms for the CALLER — `GET /attendance/auto-clock/plan`.
 * Only workspaces where the workspace switched it on, the member is chosen
 * (`SpaceAssignment.autoClock`) and the assignment is active; never the Remote
 * bucket. The phone keeps it offline and arms OS geofences from it.
 */
export interface AutoClockPlace {
  spaceId: string;
  name: string;
  lat: number;
  lng: number;
  /** Metres. A drawn boundary is armed as its enclosing circle; the decision still uses `isAtSite`. */
  radius: number;
  polygon?: Array<{ lat: number; lng: number }> | null;
  settings: AutoClockSettings;
  /** The planned shifts, after approved requests (changed day / agreed overtime). ISO instants. */
  shifts: Array<{ start: string; end: string }>;
  /**
   * Set when this member is clocked by arriving and leaving here (PRESENCE).
   * Absent → by shift only (and from a server older than this).
   */
  presence?: {
    startWindow: AutoClockStartWindow | null;
    timezone: string;
    /** The workspace's hours without a shift, as of `generatedAt` (the phone refreshes it). */
    noShiftMinutes: number;
    noShiftLimit: boolean;
  } | null;
}

export interface AutoClockPlan {
  /** When the member consented in the app (null = never / withdrawn → the phone arms nothing). */
  consentAt: string | null;
  /** Today and tomorrow in each workspace's zone, so a phone offline overnight still arms the morning. */
  places: AutoClockPlace[];
  generatedAt: string;
  /**
   * How many workspaces have chosen this member — on there, the member chosen,
   * Time Tracking running — whether or not they have agreed yet. It is what
   * decides whether the phone OFFERS the switch (`showAutoClockSwitch`): asking
   * somebody to agree to a clock no workspace uses for them is a question with
   * no answer. Absent from a server older than this field.
   */
  offered?: number;
  /**
   * Their NAMES, so the phone can say where it works — a member in three
   * workspaces where one uses it must not read the switch as "all three".
   * Names only: the member already sees their own workspaces.
   */
  offeredIn?: string[];
}

/**
 * PHONE: is the automatic clock's switch shown? Once the member has agreed it
 * always is (they can always withdraw); before that, only where a workspace has
 * chosen them. A plan from an older server (no `offered`) shows it, as before.
 */
export function showAutoClockSwitch(plan: { consentAt: string | null; offered?: number } | null | undefined): boolean {
  if (!plan) return false;
  if (plan.consentAt) return true;
  return plan.offered === undefined || plan.offered > 0;
}

/** Codes the automatic clock answers with. */
export type AutoClockErrorCode =
  | 'AUTO_CLOCK_SETTING_INVALID'
  /** Undo refused: not an automatic clock-in, too late, or work already recorded on it. */
  | 'AUTO_CLOCK_UNDO_NOT_ALLOWED'
  /** A clock-in resent with the id of an automatic clock-in its owner already undid. */
  | 'AUTO_CLOCK_UNDONE';

/* ------------------------------------------------------------------ server re-check */

/**
 * Is the automatic clock ON for this member at this workspace? All three — the
 * workspace switched it on, the member is chosen there, the member consented —
 * and never for an external member (they hold no clock).
 */
export function autoClockActive(input: AutoClockMemberInput & {
  consentAt: Date | string | null | undefined;
}): MemberAutoClockSettings | null {
  if (!input.consentAt) return null;
  return autoClockOffered(input);
}

/**
 * Has the OFFICE chosen this member for the automatic clock here — the
 * workspace on, the member chosen, not external — leaving out only their own
 * consent? `autoClockActive` is this plus the consent.
 */
export function autoClockOffered(input: AutoClockMemberInput): MemberAutoClockSettings | null {
  if (input.assignmentAutoClock !== true || input.isExternal === true) return null;
  if (input.settings == null) return null;
  const parsed = parseAutoClockSettings(input.settings);
  if (!parsed.ok || !parsed.value.enabled) return null;
  return {
    ...parsed.value,
    mode: isAutoClockMode(input.mode) ? input.mode : 'SHIFT',
    startWindow: readAutoClockStartWindow(input.startWindow),
    noShiftMinutes: clampDailyMinutes(input.noShiftDailyMinutes),
    noShiftLimit: isNoShiftPolicy(input.noShiftPolicy) && input.noShiftPolicy === 'LIMIT',
  };
}

/** What both answers read: the workspace's settings and hours, and this member's assignment there. */
export interface AutoClockMemberInput {
  settings: unknown;
  assignmentAutoClock: boolean | null | undefined;
  isExternal?: boolean | null;
  /** SpaceAssignment.autoClockMode / autoClockStartWindow. */
  mode?: unknown;
  startWindow?: unknown;
  /** CompanyLocation.noShiftDailyMinutes / noShiftPolicy. */
  noShiftDailyMinutes?: number | null;
  noShiftPolicy?: string | null;
}

/**
 * SERVER: does a clock-in the phone says was automatic, at `at`, fall inside the
 * window the phone was allowed to clock in? The same rule as `decideAutoClockIn`
 * asked of the moment it claims — the dwell is the phone's to see, so `now` is
 * the earliest the phone could have decided. A claim before the window opens
 * (the arrival moved back) or once the shift is over is not automatic.
 */
export function autoClockInWithinWindow(
  settings: AutoClockSettings,
  at: Date,
  shiftStart: Date | null,
  shiftEnd: Date | null,
): boolean {
  const d = decideAutoClockIn({
    settings,
    now: new Date(at.getTime() + settings.dwellMinutes * 60_000),
    enteredAt: at,
    stillInside: true,
    shiftStart,
    shiftEnd,
    alreadyClockedIn: false,
  });
  return d.action === 'CLOCK_IN' && d.at.getTime() === at.getTime();
}

/** SERVER: is an automatic clock-out at `at` a departure the phone was allowed to make (at or after the planned end)? */
export function autoClockOutAfterEnd(settings: AutoClockSettings, at: Date, plannedEnd: Date | null): boolean {
  return (
    decideAutoClockOut({
      settings,
      now: new Date(at.getTime() + settings.exitGraceMinutes * 60_000),
      exitedAt: at,
      stillOutside: true,
      plannedEnd,
      clockedIn: true,
    }).action === 'CLOCK_OUT'
  );
}

/**
 * SERVER: an automatic clock-in at `at` for a member clocked by arriving and
 * leaving — the same `decidePresenceClockIn` asked of the moment it claims.
 * Outside their usual hours is not automatic (the phone asks; a "yes" is a tap).
 */
export function presenceClockInAllowed(settings: MemberAutoClockSettings, at: Date, timezone: string): boolean {
  const d = decidePresenceClockIn({
    settings,
    now: new Date(at.getTime() + settings.dwellMinutes * 60_000),
    enteredAt: at,
    stillInside: true,
    timezone,
    alreadyClockedIn: false,
  });
  return d.action === 'CLOCK_IN' && d.at.getTime() === at.getTime();
}

/** Clock skew and transport, on top of the undo window. */
export const AUTO_CLOCK_UNDO_SLACK_MINUTES = 2;

/**
 * Until when the owner may undo an automatic clock-in. The phone clocks in only
 * after the dwell and tells them then, so the window runs from that moment:
 * clock-in + dwell + AUTO_CLOCK_UNDO_MINUTES, plus AUTO_CLOCK_UNDO_SLACK_MINUTES.
 * Judged at the moment of the undo TAP (its evidence), so an undo made offline
 * and sent later is judged when it was made.
 */
export function autoClockUndoDeadline(clockInAt: Date, settings: Pick<AutoClockSettings, 'dwellMinutes'>): Date {
  return new Date(clockInAt.getTime() + (settings.dwellMinutes + AUTO_CLOCK_UNDO_MINUTES + AUTO_CLOCK_UNDO_SLACK_MINUTES) * 60_000);
}
