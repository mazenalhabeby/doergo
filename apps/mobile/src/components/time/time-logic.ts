/**
 * The Time tab's rules — pure, so each is a test and none is a guess in JSX.
 */
import { haversineDistance, isAtSite, localDateKey } from '@hbcfield/shared/client';
import type { CompanyLocation } from '@hbcfield/shared/client';

/* ------------------------------------------------------------------ */
/* Where you work                                                      */
/* ------------------------------------------------------------------ */

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

/**
 * The workspaces a member is assigned to, in the order they matter NOW: the
 * one they are clocked in at, then the one they are standing in, then the rest
 * by distance, then the ones with no site at all.
 *
 * ⚠️ "HERE" IS THE SERVER'S RULE, `isAtSite` — the drawn outline when there is
 * one, the radius otherwise. A tile that said "here" by a plain radius would
 * contradict the clock-in that refuses the same position a second later.
 *
 * ⚠️ THE REMOTE BUCKET IS NOT A PLACE. It is how "away from a site" is filed,
 * and listing it would show a workspace that has no address as if it had one.
 */
export function placesView(
  locations: readonly CompanyLocation[],
  fix: { lat: number; lng: number; accuracy?: number | null } | null,
  clockedInId: string | null,
): PlaceTile[] {
  const tiles = locations
    .filter((l) => !l.isRemote)
    .map((location): PlaceTile => {
      const hasSite = location.lat != null && location.lng != null;
      const metres = hasSite && fix ? Math.round(haversineDistance(fix.lat, fix.lng, location.lat, location.lng)) : null;
      if (location.id === clockedInId) return { location, relation: 'clockedIn', metres };
      if (!hasSite) return { location, relation: 'anywhere', metres: null };
      if (!fix) return { location, relation: 'unknown', metres: null };
      const at = isAtSite(fix, location);
      return { location, relation: at.inside ? 'here' : 'away', metres };
    });
  const rank: Record<PlaceRelation, number> = { clockedIn: 0, here: 1, away: 2, unknown: 3, anywhere: 4 };
  return tiles.sort((a, b) =>
    rank[a.relation] - rank[b.relation]
    || (a.metres ?? Infinity) - (b.metres ?? Infinity)
    || a.location.name.localeCompare(b.location.name),
  );
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

type LeaveMark = 'approved' | 'pending';

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
const EXTRA_STEP = 15;
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
