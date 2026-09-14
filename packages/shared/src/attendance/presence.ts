/**
 * Where somebody on the clock is working RIGHT NOW: on site, in the field, or
 * remote.
 *
 * ⚠️ DECIDED FROM EVIDENCE, NEVER ASKED, AND NEVER FROZEN AT CLOCK-IN. People
 * move after they clock in — a seller clocks in at the office and drives to
 * clients, a technician clocks in near home and starts the first job, somebody
 * clocks in from the café next door and walks in. A group fixed at the tap is
 * wrong for all three by nine o'clock.
 *
 * ⚠️ A JOB ALONE IS NOT THE FIELD. An office worker handles jobs online all
 * day. Only physical evidence moves somebody into the field: on the way to a
 * job, standing at a job's address, or having changed place.
 *
 * Display only. Counted time, away permissions and the out-of-area workflow do
 * not read this and must not start to: it is a best judgement from a phone,
 * and pay cannot rest on a judgement.
 *
 * Pure, and the only implementation: the live heartbeat, a replayed offline
 * batch and the clock-in all decide through `decidePresence`.
 */
import { haversineDistance } from '../utils/geofence';

export const WORK_PRESENCES = ['ON_SITE', 'FIELD', 'REMOTE'] as const;
export type WorkPresence = (typeof WORK_PRESENCES)[number];

export const PRESENCE_REASONS = [
  'INSIDE_AREA', // inside the workspace's area
  'ON_THE_WAY', // a job is on its way
  'AT_JOB', // at the address of an open job assigned to them
  'MOVED', // changed place since the last position that counted
  'NEAR_AREA', // just outside the area, not moved away — lunch, the car park
  'STILL_OUT', // not moving, and already in the field this session
  'JOBS_TODAY', // not moving, with jobs at an address still to do
  'AWAY', // not moving, nothing says field
] as const;
export type PresenceReason = (typeof PRESENCE_REASONS)[number];

export const PRESENCE = {
  /** Farther than this from the anchor is "changed place". Heartbeats are 5 minutes apart, so this is not a speed. */
  MOVED_METERS: 500,
  /** Within this of a job's address is "at the job". Addresses are geocoded to the door; yards are bigger. */
  AT_JOB_METERS: 150,
  /** No position for this long reads "No signal since …". Three missed heartbeats. */
  STALE_AFTER_MS: 15 * 60_000,
  /** How often an unchanged heartbeat refreshes "last seen" — so a steady day is a handful of writes, not 100. */
  SEEN_WRITE_EVERY_MS: 10 * 60_000,
} as const;

export function isWorkPresence(v: unknown): v is WorkPresence {
  return typeof v === 'string' && (WORK_PRESENCES as readonly string[]).includes(v);
}

export interface PresencePoint {
  lat: number;
  lng: number;
}

export interface PresenceJob {
  lat: number | null;
  lng: number | null;
  /** On its way: started and not arrived. */
  onTheWay: boolean;
}

export interface PresenceState {
  presence: WorkPresence | null;
  /** Where the member last was when place last counted; movement is measured from here. */
  anchor: PresencePoint | null;
}

export interface PresenceDecision {
  presence: WorkPresence;
  reason: PresenceReason;
  anchor: PresencePoint;
  /** True when the group differs from `state` — the only time anything is written. */
  changed: boolean;
}

/**
 * The group for one position.
 *
 * First match wins:
 *   1. inside the workspace's area                → ON_SITE
 *   2. a job on its way, or at an open job's door → FIELD
 *   3. changed place since the anchor             → FIELD
 *   4. not moving: was ON_SITE                    → ON_SITE (lunch outside, the car park)
 *      not moving: already FIELD                  → FIELD (between clients, a coffee)
 *      not moving: jobs with an address to do    → FIELD (waiting for the next one)
 *      otherwise                                  → REMOTE
 */
export function decidePresence(input: {
  point: PresencePoint;
  /** Is the point inside the workspace's area? `false` for a workspace with none. */
  insideArea: boolean;
  /** The member's open jobs — only their address and whether one is on its way are read. */
  jobs: readonly PresenceJob[];
  state: PresenceState;
}): PresenceDecision {
  const { point, insideArea, jobs, state } = input;
  const decide = (presence: WorkPresence, reason: PresenceReason, anchor: PresencePoint): PresenceDecision => ({
    presence,
    reason,
    anchor,
    changed: presence !== state.presence,
  });

  if (insideArea) return decide('ON_SITE', 'INSIDE_AREA', point);
  if (jobs.some((j) => j.onTheWay)) return decide('FIELD', 'ON_THE_WAY', point);
  if (jobs.some((j) => j.lat != null && j.lng != null && haversineDistance(point.lat, point.lng, j.lat, j.lng) <= PRESENCE.AT_JOB_METERS)) {
    return decide('FIELD', 'AT_JOB', point);
  }

  const moved = state.anchor
    ? haversineDistance(point.lat, point.lng, state.anchor.lat, state.anchor.lng) > PRESENCE.MOVED_METERS
    : false;
  // Coming out of the area is a change of place too: the anchor was inside it.
  if (moved && state.presence !== null) return decide('FIELD', 'MOVED', point);

  // Not moving: the anchor stays put, so slow drift still adds up to "moved".
  const anchor = state.anchor ?? point;
  if (state.presence === 'ON_SITE') return decide('ON_SITE', 'NEAR_AREA', anchor);
  if (state.presence === 'FIELD') return decide('FIELD', 'STILL_OUT', anchor);
  if (jobs.some((j) => j.lat != null && j.lng != null)) return decide('FIELD', 'JOBS_TODAY', anchor);
  return decide('REMOTE', 'AWAY', anchor);
}

export interface PresenceChange {
  at: Date;
  presence: WorkPresence;
  reason: PresenceReason;
  /** Where it happened; movement after it is measured from here. Null when there was no position (a job tap). */
  anchor: PresencePoint | null;
}

/**
 * A run of positions, oldest first — a phone's offline batch. Returns only the
 * CHANGES, and the state after the last point, so the caller writes each change
 * once and the entry once, whatever the length of the batch.
 */
export function replayPresence(input: {
  points: readonly (PresencePoint & { at: Date; insideArea: boolean })[];
  jobs: readonly PresenceJob[];
  state: PresenceState;
}): { changes: PresenceChange[]; state: PresenceState; last: PresenceDecision | null } {
  let state = input.state;
  let last: PresenceDecision | null = null;
  const changes: PresenceChange[] = [];
  for (const p of input.points) {
    const d = decidePresence({ point: p, insideArea: p.insideArea, jobs: input.jobs, state });
    if (d.changed) changes.push({ at: p.at, presence: d.presence, reason: d.reason, anchor: d.anchor });
    state = { presence: d.presence, anchor: d.anchor };
    last = d;
  }
  return { changes, state, last };
}

/** What the dashboard says about how fresh a group is. */
export type PresenceFreshness = 'LIVE' | 'NO_SIGNAL' | 'NO_LIVE_UPDATES';

export function presenceFreshness(input: {
  clockInAt: Date | string;
  lastSeenAt: Date | string | null | undefined;
  now: Date;
}): PresenceFreshness {
  const now = input.now.getTime();
  if (!input.lastSeenAt) {
    // Never heard from since clock-in: a computer, or a phone without location in the background.
    return now - new Date(input.clockInAt).getTime() > PRESENCE.STALE_AFTER_MS ? 'NO_LIVE_UPDATES' : 'LIVE';
  }
  return now - new Date(input.lastSeenAt).getTime() > PRESENCE.STALE_AFTER_MS ? 'NO_SIGNAL' : 'LIVE';
}
