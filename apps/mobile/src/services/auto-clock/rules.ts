import {
  autoClockUndoDeadline,
  autoRestPlan,
  clocksByPresence,
  haversineDistance,
  type AutoClockPlace,
  type AutoClockSettings,
  type CompanyLocation,
  type MemberAutoClockSettings,
} from '@hbcfield/shared/client';

/*
  THE AUTOMATIC CLOCK ON THE PHONE — the pure half.

  Everything here is a decision from facts: which workspaces to watch, which
  shift a moment belongs to, what entering and leaving does to what the phone
  remembers, which reminders a clock-in schedules. The shared contract
  (attendance/auto-clock.ts) decides WHETHER to clock; these decide the rest,
  and `runner.ts` only carries the answers out. No React Native, no storage.
*/

/** A region the OS watches for the automatic clock — `auto:<spaceId>`. */
export const AUTO_REGION_PREFIX = 'auto:';

/**
 * iOS monitors at most twenty regions for an app, all purposes together; Android
 * allows a hundred, and one rule for both is the one that cannot surprise.
 */
export const MAX_OS_REGIONS = 20;

/** OS geofences below ~50 m are unreliable; the decision still uses the real site (`isAtSite`). */
export const MIN_OS_RADIUS_M = 50;

/**
 * How far ahead of a shift's window an arrival is filed and held. Walking in
 * at 06:50 for 08:00 with a 30-minute lead holds a clock-in dated 07:30; at
 * 20:00 the evening before, nothing is filed — that is somebody who lives next
 * door, not an arrival.
 */
export const ARRIVAL_AHEAD_MS = 3 * 60 * 60_000;

export interface OsRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

export const autoRegionId = (spaceId: string) => `${AUTO_REGION_PREFIX}${spaceId}`;

/** The workspace an automatic region watches, or null for any other region. */
export function spaceOfRegion(identifier: string | null | undefined): string | null {
  return identifier && identifier.startsWith(AUTO_REGION_PREFIX) ? identifier.slice(AUTO_REGION_PREFIX.length) || null : null;
}

interface Shift {
  start: Date;
  end: Date;
}

const shiftsOf = (place: AutoClockPlace): Shift[] =>
  place.shifts
    .map((s) => ({ start: new Date(s.start), end: new Date(s.end) }))
    .filter((s) => !Number.isNaN(s.start.getTime()) && !Number.isNaN(s.end.getTime()) && s.end > s.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

/**
 * The workspaces worth watching now — switched on, on the map, with a shift
 * not yet over (its exit grace included, or the departure is missed) — nearest
 * first when the phone knows where it is, at most `max`.
 */
export function selectAutoRegions(
  places: readonly AutoClockPlace[],
  opts: { now: Date; origin?: { lat: number; lng: number } | null; max: number },
): OsRegion[] {
  const now = opts.now.getTime();
  const live = places.filter(
    (p) =>
      p.settings.enabled &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      // Clocked by arriving and leaving: always worth watching (no shift to wait for).
      (!!p.presence || shiftsOf(p).some((s) => s.end.getTime() + p.settings.exitGraceMinutes * 60_000 > now)),
  );
  const origin = opts.origin;
  const ranked = origin
    ? live
        .map((p) => ({ p, d: haversineDistance(origin.lat, origin.lng, p.lat, p.lng) }))
        .sort((a, b) => a.d - b.d)
        .map((x) => x.p)
    : live;
  return ranked.slice(0, Math.max(0, opts.max)).map((p) => ({
    identifier: autoRegionId(p.spaceId),
    latitude: p.lat,
    longitude: p.lng,
    radius: Math.max(p.radius || 0, MIN_OS_RADIUS_M),
    notifyOnEnter: true,
    notifyOnExit: true,
  }));
}

/**
 * The shift an ARRIVAL at `now` belongs to: the first not yet over whose
 * window (lead minutes before the start) opens within ARRIVAL_AHEAD_MS.
 */
export function shiftForArrival(place: AutoClockPlace, now: Date): Shift | null {
  const t = now.getTime();
  const lead = place.settings.leadMinutes * 60_000;
  return shiftsOf(place).find((s) => s.end.getTime() > t && s.start.getTime() - lead - ARRIVAL_AHEAD_MS <= t) ?? null;
}

/** The planned shift whose window (from its lead before the start, to its end) holds a clock-in — or null. */
export function shiftHolding(place: AutoClockPlace, clockInAt: Date): Shift | null {
  const t = clockInAt.getTime();
  const lead = place.settings.leadMinutes * 60_000;
  return shiftsOf(place).find((s) => s.start.getTime() - lead <= t && t < s.end.getTime()) ?? null;
}

/** The planned shift a running entry belongs to: the one whose window holds its clock-in, else the nearest. */
export function shiftForEntry(place: AutoClockPlace, clockInAt: Date): Shift | null {
  const t = clockInAt.getTime();
  const all = shiftsOf(place);
  const holding = shiftHolding(place, clockInAt);
  if (holding) return holding;
  let best: Shift | null = null;
  for (const s of all) {
    const gap = Math.min(Math.abs(s.start.getTime() - t), Math.abs(s.end.getTime() - t));
    const bestGap = best ? Math.min(Math.abs(best.start.getTime() - t), Math.abs(best.end.getTime() - t)) : Infinity;
    if (gap < bestGap) best = s;
  }
  return best;
}

/**
 * A place clocked by arriving and leaving, as the shared rules read it — or
 * null when this member is clocked by shift only here. The workspace's hours
 * come with the plan, refreshed with it.
 */
export function presenceSettings(place: AutoClockPlace): MemberAutoClockSettings | null {
  const p = place.presence;
  if (!p) return null;
  return {
    ...place.settings,
    mode: 'PRESENCE',
    startWindow: p.startWindow,
    noShiftMinutes: p.noShiftMinutes,
    noShiftLimit: p.noShiftLimit,
  };
}

/* ------------------------------------------------------------------ memory */

/** What the phone remembers about one watched workspace. */
export interface PlaceState {
  inside: boolean;
  /** When the member walked in (epoch ms) — kept across repeated ENTER events. */
  enteredAt?: number;
  /** When they walked out — kept across repeated EXIT events. */
  exitedAt?: number;
  /** The automatic clock-in filed for this visit. */
  inOp?: { opId: string; entryId: string; at: number; holdUntil: number };
  /** The automatic clock-out filed for this departure. */
  outOp?: { opId: string; entryId: string };
  /** The local day a "tap to clock in" was last shown here — once a day is a heads-up, more is a nag. */
  promptedDay?: string;
}

/**
 * An ENTER. The OS repeats it — every time the regions are armed again it
 * reports where the phone already is — so the FIRST moment of a visit is kept.
 */
export function entered(prev: PlaceState | undefined, at: number): PlaceState {
  if (prev?.inside && prev.enteredAt !== undefined) return prev;
  const { exitedAt: _gone, ...rest } = prev ?? { inside: false };
  return { ...rest, inside: true, enteredAt: at };
}

/** An EXIT. Repeated exits keep the first moment they left. */
export function exited(prev: PlaceState | undefined, at: number): PlaceState {
  if (prev && !prev.inside && prev.exitedAt !== undefined) return prev;
  return { ...(prev ?? {}), inside: false, exitedAt: at };
}

/* ------------------------------------------------------------------ reminders */

export type ReminderKind = 'in' | 'rest' | 'end';

/**
 * What an automatic clock-in schedules on the phone — notifications the OS
 * delivers on time with no JavaScript running: the planned automatic rest
 * ("Still working" cancels it) and "Still here?" once the shift is over and
 * the exit grace has passed.
 */
export function remindersFor(input: {
  settings: AutoClockSettings;
  shift: Shift;
  now: Date;
}): { rest: { startAt: Date; endAt: Date } | null; end: Date | null } {
  const rest = autoRestPlan({ settings: input.settings, shiftStart: input.shift.start, shiftEnd: input.shift.end, restTaken: false });
  const end = new Date(input.shift.end.getTime() + input.settings.exitGraceMinutes * 60_000);
  return {
    rest: rest && rest.startAt > input.now ? rest : null,
    end: end > input.now ? end : null,
  };
}

/**
 * A plan place as the local clock-in check reads a workspace, for when the
 * phone's copy of the member's workspaces does not have it. Never away-allowed:
 * the automatic clock only ever clocks somebody in AT the site.
 */
export function placeAsLocation(place: AutoClockPlace): CompanyLocation {
  return {
    id: place.spaceId,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    geofenceRadius: place.radius,
    geofencePolygon: place.polygon ?? null,
    awayAllowed: false,
  } as unknown as CompanyLocation;
}

/** How a departure from a running entry is judged. */
export type DepartureBasis = { kind: 'undo' } | { kind: 'excursion' } | { kind: 'judge'; plannedEnd: Date | null };

/**
 * The basis a departure is judged on.
 *
 * ⚠️ A clock-in still on the phone (queued offline) has no expectedClockInAt —
 * only the server stamps it — so "no expected start" is not "no shift": the
 * plan's own shift holding the clock-in rules first, and a rota day goes by
 * the shift even for somebody otherwise clocked by presence. (13 Oct: a queued
 * automatic clock-in was read as a presence session; an exit 11 s later filed
 * an automatic clock-out and the server made an 11-second "Left early" entry.)
 *
 * Leaving inside the Undo window of our own automatic clock-in is never going
 * home: by presence they never stayed (undo, as the server's Undo removes it);
 * on a shift it is an excursion.
 */
export function departureBasis(
  place: AutoClockPlace,
  entry: { id: string; clockInAt: string; expectedClockInAt?: string | null; expectedClockOutAt?: string | null },
  ownClockIn: { entryId: string; at: number } | undefined,
  exitedAt: Date,
): DepartureBasis {
  const clockInAt = new Date(entry.clockInAt);
  const byPresence = !shiftHolding(place, clockInAt) && clocksByPresence(presenceSettings(place), entry);
  if (ownClockIn?.entryId === entry.id && exitedAt.getTime() < autoClockUndoDeadline(new Date(ownClockIn.at), place.settings).getTime()) {
    return byPresence ? { kind: 'undo' } : { kind: 'excursion' };
  }
  // Approved extra time MOVES the expected end — read it first, the plan second.
  if (byPresence) return { kind: 'judge', plannedEnd: clockInAt };
  if (entry.expectedClockOutAt) return { kind: 'judge', plannedEnd: new Date(entry.expectedClockOutAt) };
  return { kind: 'judge', plannedEnd: shiftForEntry(place, clockInAt)?.end ?? null };
}
