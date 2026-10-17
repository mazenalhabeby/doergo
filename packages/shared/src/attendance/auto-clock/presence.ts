/** Clocked by arriving and leaving: the mode, the usual start window, and its decisions. */
import { addDaysStr, localPartsIn, zonedWallTimeToUtc } from '../zoned-time';
import { decideAutoClockIn, type AutoClockInDecision } from './decisions';
import type { AutoClockSettings, AutoClockSettingsError } from './settings';

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
):
  { ok: true; value: AutoClockStartWindow | null } | { ok: false; code: AutoClockSettingsError; field: 'startWindow' } {
  if (raw == null) return { ok: true, value: null };
  const b = typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const from = typeof b.from === 'string' ? b.from : '';
  const to = typeof b.to === 'string' ? b.to : '';
  if (HHMM.test(from) && HHMM.test(to) && from !== to) return { ok: true, value: { from, to } };
  return opts.strict
    ? { ok: false, code: 'AUTO_CLOCK_SETTING_INVALID', field: 'startWindow' }
    : { ok: true, value: null };
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
export function startWindowAround(
  window: AutoClockStartWindow,
  tz: string,
  at: Date,
): { start: Date; end: Date } | null {
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
  if (input.now.getTime() < presenceSessionEnd(input.clockInAt, input.settings).getTime() + graceMs)
    return { due: false, lastSeenOnSiteAt };
  const silent = !input.lastSeenAt || input.now.getTime() - input.lastSeenAt.getTime() >= graceMs;
  const gone = !!input.leftSiteAt || input.presence !== 'ON_SITE' || silent;
  return { due: gone, lastSeenOnSiteAt };
}

/**
 * Is this entry clocked by arriving and leaving? The member's mode is PRESENCE
 * and the entry matched no planned shift (`expectedClockInAt` is set only by a
 * shift). On a rota day the shift's rules apply, as for anyone.
 */
export function clocksByPresence(
  settings: Pick<MemberAutoClockSettings, 'mode'> | null | undefined,
  entry: { expectedClockInAt?: Date | string | null },
): boolean {
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
  const xs = [
    ...new Set(localMinutes.filter((m) => Number.isFinite(m)).map((m) => ((Math.round(m) % 1440) + 1440) % 1440)),
  ].sort((a, b) => a - b);
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
