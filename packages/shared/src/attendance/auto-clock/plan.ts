/** Flags, triggers, the phone's plan, error codes, and whether the clock is on for a member. */
import { clampDailyMinutes, isNoShiftPolicy } from '../no-shift-limit';
import { decideAutoClockIn, decideAutoClockOut } from './decisions';
import {
  decidePresenceClockIn,
  isAutoClockMode,
  readAutoClockStartWindow,
  type AutoClockStartWindow,
  type MemberAutoClockSettings,
} from './presence';
import { parseAutoClockSettings, type AutoClockSettings } from './settings';

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
