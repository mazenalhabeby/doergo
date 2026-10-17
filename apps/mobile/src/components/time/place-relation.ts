import { localDateKey, noShiftAllowanceNow, type NoShiftAllowance } from '@hbcfield/shared/client';
import type { CompanyLocation } from '@hbcfield/shared/client';

export type PlaceRelation =
  /** Clocked in there now. */
  | 'clockedIn'
  /** Inside its site right now. */
  | 'here'
  /** Outside it, this far. */
  | 'away'
  /** No site drawn — clocks in from anywhere. */
  | 'anywhere'
  /** It has a site, but the phone has no position to compare. */
  | 'unknown';

export interface PlaceTile {
  location: CompanyLocation;
  relation: PlaceRelation;
  /** Metres to the site's centre; null when there is nothing to measure. */
  metres: number | null;
}

/** A workspace's no-shift rule for this member now — null where it allows it freely. */
export function noShiftOf(location: CompanyLocation, now: Date): NoShiftAllowance | null {
  const a = noShiftAllowanceNow(location.noShift, now);
  return a.kind === 'free' ? null : a;
}

export interface NoShiftNote {
  location: CompanyLocation;
  allowance: NoShiftAllowance;
}

/**
 * The ONE workspace whose no-shift rule the Time page talks about: the one the
 * member is standing in (or their only one), and only while not clocked in.
 *
 * ⚠️ NEVER ONE MESSAGE PER WORKSPACE. The page stacked a banner for every
 * workspace with a limit — ten workspaces, ten banners, pushing the clock card
 * off the screen. The rest say their rule quietly on their own tile.
 */
export function noShiftHere(tiles: readonly PlaceTile[], clockedIn: boolean, now: Date): NoShiftNote | null {
  if (clockedIn) return null;
  const tile = tiles.find((t) => t.relation === 'here') ?? (tiles.length === 1 ? tiles[0] : undefined);
  if (!tile) return null;
  const allowance = noShiftOf(tile.location, now);
  return allowance ? { location: tile.location, allowance } : null;
}

/* ------------------------------------------------------------------ */
/* Time off                                                            */
/* ------------------------------------------------------------------ */

/** `2026-10-05` — the LOCAL calendar day. Never `toISOString`, which is UTC. */
export const dayKey = (d: Date) => localDateKey(d);

/** A request's date, whatever shape the server sent (`2026-10-05` or a full ISO). */
export const dayOf = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Which weekdays this member works (0 = Sunday, as `getDay`), or null when no
 * weekly schedule is set.
 *
 * ⚠️ NULL IS "WE DO NOT KNOW", NOT "NEVER". A member with no schedule can take
 * any day off; reading the absence as "works no days" would grey out the whole
 * calendar, and reading it as Monday–Friday would invent a rota.
 */
export function workWeekdays(schedule: ReadonlyArray<{ dayOfWeek: number; isActive: boolean }>): Set<number> | null {
  const on = schedule.filter((s) => s.isActive).map((s) => s.dayOfWeek);
  return on.length ? new Set(on) : null;
}

/** Days in [a, b] that would be taken off: working days when the rota is known, every day when it is not. */
export function daysOff(a: Date, b: Date, weekdays: Set<number> | null): number {
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (!weekdays || weekdays.has(d.getDay())) n++;
  return n;
}

export type LeaveMark = 'approved' | 'pending';

/** Every day this member already has off, or has asked for — keyed by `dayKey`. */
export function leaveDays(
  requests: ReadonlyArray<{ startDate: string; endDate: string; status: string }>,
): Map<string, LeaveMark> {
  const out = new Map<string, LeaveMark>();
  for (const r of requests) {
    if (r.status !== 'APPROVED' && r.status !== 'PENDING') continue;
    const mark: LeaveMark = r.status === 'APPROVED' ? 'approved' : 'pending';
    for (let d = dayOf(r.startDate), end = dayOf(r.endDate); d <= end; d = addDays(d, 1)) {
      // Approved wins where the two overlap.
      if (out.get(dayKey(d)) !== 'approved') out.set(dayKey(d), mark);
    }
  }
  return out;
}

/**
 * The first day in the chosen range that is already taken — the request would
 * overlap leave the member has, or has asked for. Null when it is clear.
 */
export function overlapIn(a: Date, b: Date, taken: Map<string, LeaveMark>): Date | null {
  for (let d = a; d <= b; d = addDays(d, 1)) if (taken.has(dayKey(d))) return d;
  return null;
}

/**
 * Days off used this calendar year — approved leave that has STARTED, counted
 * in this year only. Upcoming approved leave is not "used" yet.
 */
export function usedThisYear(
  requests: ReadonlyArray<{ startDate: string; endDate: string; status: string }>,
  weekdays: Set<number> | null,
  now: Date,
): number {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let n = 0;
  for (const r of requests) {
    if (r.status !== 'APPROVED') continue;
    const a = dayOf(r.startDate) < yearStart ? yearStart : dayOf(r.startDate);
    const b = dayOf(r.endDate) > today ? today : dayOf(r.endDate);
    if (a <= b) n += daysOff(a, b, weekdays);
  }
  return n;
}

/**
 * The requests worth a row on the Time tab: still ahead (or running), and not
 * refused or withdrawn — soonest first. History lives on the Time off tab.
 */
export function upcomingLeave<T extends { startDate: string; endDate: string; status: string }>(requests: readonly T[], now: Date): T[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return requests
    .filter((r) => (r.status === 'PENDING' || r.status === 'APPROVED') && dayOf(r.endDate) >= today)
    .sort((a, b) => dayOf(a.startDate).getTime() - dayOf(b.startDate).getTime());
}

/** The six-week grid a month is drawn on, Monday first. Days outside the month are still dates. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(first, -lead);
  const days = Math.ceil((lead + new Date(year, month + 1, 0).getDate()) / 7) * 7;
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

/* ------------------------------------------------------------------ */
/* A shift's status on its row                                         */
/* ------------------------------------------------------------------ */

/**
 * ⚠️ "CLOSED FOR YOU" BEATS THE APPROVAL. A shift the system closed because it
 * was left running still needs the member's real time — that is the thing to
 * read on the row, whatever its approval says. AUTO approval reads as approved.
 */
export function statusOf(e: { status: string; approvalStatus: string }): 'approved' | 'waiting' | 'rejected' | 'closedForYou' {
  if (String(e.status) === 'AUTO_OUT') return 'closedForYou';
  if (String(e.approvalStatus) === 'APPROVED' || String(e.approvalStatus) === 'AUTO') return 'approved';
  if (String(e.approvalStatus) === 'REJECTED') return 'rejected';
  return 'waiting';
}

/* ------------------------------------------------------------------ */
/* Extra time — what a leader is asked to approve                      */
/* ------------------------------------------------------------------ */

/**
 * Minutes past the shift's end: up to NOW while they are still working, up to
 * the clock-out once they have left. Zero with no planned end — there is
 * nothing to be past.
 */
export function minutesPastEnd(e: { expectedClockOutAt?: string | null; clockOutAt?: string | null }, now: Date): number {
  if (!e.expectedClockOutAt) return 0;
  const until = e.clockOutAt ? new Date(e.clockOutAt) : now;
  return Math.max(0, Math.round((until.getTime() - new Date(e.expectedClockOutAt).getTime()) / 60_000));
}

/** The step the approve sheet moves in, and its bounds (the server takes 1–1440). */
export const EXTRA_STEP = 15;

export const EXTRA_MAX = 12 * 60;

/**
 * What the Approve button offers: the time past the end, rounded UP to the
 * next quarter hour — "until now" in one tap — and never less than one step.
 */
export function suggestedExtra(pastMinutes: number): number {
  return Math.min(EXTRA_MAX, Math.max(EXTRA_STEP, Math.ceil(pastMinutes / EXTRA_STEP) * EXTRA_STEP));
}

/** One step up or down, kept inside the bounds. */
export function stepExtra(minutes: number, dir: 1 | -1): number {
  return Math.min(EXTRA_MAX, Math.max(EXTRA_STEP, minutes + dir * EXTRA_STEP));
}

/* ---------------- while on the clock (use-shift-watch.ts) ---------------- */

/** The foreground heartbeat's cadence — every five minutes while the app is IN FRONT. */
export const FOREGROUND_HEARTBEAT_MS = 5 * 60 * 1000;

/**
 * Is a foreground heartbeat due?
 *
 * ⚠️ ONLY WHILE THE APP IS IN FRONT. The five-minute `setInterval` kept firing
 * behind another app on Android (the shift's own foreground service keeps JS
 * alive), and each tick took a FRESH GPS fix — on top of the background
 * heartbeat that exists for exactly that time (15 min / 150 m, plus native
 * geofencing). In the background it now waits; on the way back it beats at
 * once if five minutes have gone, never more often.
 */
export function heartbeatDue(lastBeatMs: number, nowMs: number, appActive: boolean, everyMs = FOREGROUND_HEARTBEAT_MS): boolean {
  return appActive && nowMs - lastBeatMs >= everyMs;
}

/** "4:05" / "1:02:09" left of an approved excursion's grace. */
export function graceCountdown(targetMs: number, nowMs: number): string {
  const total = Math.floor(Math.max(0, targetMs - nowMs) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * "Waiting for Anna to approve your extra time" — the person it was sent to
 * (`askedOf`, the own-request rule: a leader's own goes to the administrators).
 * An older server sends no names: the line it always said.
 */
export function waitingText(overtime: { askedOf?: { names: string[]; more: number } | null }, t: (k: string, o?: Record<string, unknown>) => string): string {
  const names = overtime.askedOf?.names ?? [];
  if (names.length === 0) return t('overtime.waitingApproval');
  const others = names.length - 1 + (overtime.askedOf?.more ?? 0);
  return others > 0 ? t('overtime.waitingForOthers', { name: names[0], count: others }) : t('overtime.waitingFor', { name: names[0] });
}

/**
 * The line under the workspace on the extra-time page — what is TRUE of this
 * shift, never "Your shift has ended" for a session that had no shift.
 */
export type OvertimePlaceLine =
  | { key: 'approvedUntil' | 'clockedOutAt' | 'shiftEndedAt' | 'shiftEndsAt' | 'onClockSince'; at: string }
  | null;

export function overtimePlaceLine(
  req: { status: string; overtimeEndAt?: string | null; timeEntry?: { clockInAt: string; clockOutAt: string | null; expectedClockOutAt: string | null } | null },
  now: Date,
): OvertimePlaceLine {
  if (req.status === 'APPROVED' && req.overtimeEndAt) return { key: 'approvedUntil', at: req.overtimeEndAt };
  const e = req.timeEntry;
  if (!e) return null;
  if (e.clockOutAt) return { key: 'clockedOutAt', at: e.clockOutAt };
  if (!e.expectedClockOutAt) return { key: 'onClockSince', at: e.clockInAt };
  return new Date(e.expectedClockOutAt).getTime() <= now.getTime()
    ? { key: 'shiftEndedAt', at: e.expectedClockOutAt }
    : { key: 'shiftEndsAt', at: e.expectedClockOutAt };
}
