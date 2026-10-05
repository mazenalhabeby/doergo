/**
 * A task OPEN TO A WORK ROLE — "a Mechanic", not "Ahmad".
 *
 * The office opens a task to a role in a workspace, with how many people it
 * needs. Whoever holds that role there may take it; the first to take each
 * place gets it. The rules live here once, so the server that offers and
 * claims, the web that previews and the phone that lists all agree.
 *
 * ⚠️ AN ADDITION, NEVER A REPLACEMENT. A task with no `openRoleId` is assigned
 * by name exactly as before, and nothing below is asked about it.
 *
 * ⚠️ THE CLAIM IS THE SERVER'S. `spotsLeft` here is for a screen; the server
 * takes a place with one conditional update, so two people tapping at once can
 * never both get the last one.
 */
import { haversineDistance } from '../utils/geofence';
import { isWorkOver } from './my-work';

/** What is known about one person holding the role, right now. */
export interface RoleCandidate {
  userId: string;
  name: string;
  /** Clocked in (an open time entry), anywhere. */
  clockedIn: boolean;
  /** A job of theirs is in progress (holds their one slot). */
  onActiveJob: boolean;
  /** Approved leave covers today. */
  onLeave: boolean;
  /** Expected at work today by their rota (true when they have no rota). */
  rosteredToday: boolean;
  /** Straight-line km from their last known position to the job; null = unknown. */
  distanceKm: number | null;
  /** Jobs on their list due today. */
  jobsToday: number;
  /** Role tasks they TOOK in the last seven days — sharing the work out. */
  takenThisWeek: number;
}

export type CandidateState = 'FREE' | 'BUSY' | 'NOT_WORKING' | 'ON_LEAVE';

/**
 * Free = could start now: on the clock, no job in progress, not on leave.
 * BUSY = at work but on a job (may still take one for afterwards).
 * NOT_WORKING = not clocked in, or not rostered today.
 */
export function candidateState(c: Pick<RoleCandidate, 'clockedIn' | 'onActiveJob' | 'onLeave' | 'rosteredToday'>): CandidateState {
  if (c.onLeave) return 'ON_LEAVE';
  if (!c.clockedIn) return 'NOT_WORKING';
  if (c.onActiveJob) return 'BUSY';
  return 'FREE';
}

const STATE_ORDER: Record<CandidateState, number> = { FREE: 0, BUSY: 1, NOT_WORKING: 2, ON_LEAVE: 3 };

/**
 * Best first: free now → nearest → fewest jobs today → fewest taken this week
 * → name (so the order is stable between two looks at the same moment).
 *
 * A NOT_WORKING person who is rostered today ranks above one who is not: they
 * are about to start, and the wider wave reaches them.
 */
export function rankCandidates<T extends RoleCandidate>(list: readonly T[]): (T & { state: CandidateState })[] {
  const km = (c: RoleCandidate) => (c.distanceKm == null ? Number.POSITIVE_INFINITY : c.distanceKm);
  return list
    .map((c) => ({ ...c, state: candidateState(c) }))
    .sort((a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      Number(b.rosteredToday) - Number(a.rosteredToday) ||
      km(a) - km(b) ||
      a.jobsToday - b.jobsToday ||
      a.takenThisWeek - b.takenThisWeek ||
      a.name.localeCompare(b.name),
    );
}

/** Minutes before the offer widens, and before the creator is told — per workspace, else these. */
export const ROLE_OFFER_WIDEN_MIN = 10;
export const ROLE_OFFER_ALERT_MIN = 30;
/** Bounds for the workspace setting — a 0-minute wave would spam, a day-long one is no wave. */
export const ROLE_OFFER_MIN_MINUTES = 1;
export const ROLE_OFFER_MAX_MINUTES = 24 * 60;
/** People one task may ask of a role. */
export const ROLE_SPOTS_MAX = 20;

export function roleOfferTimings(space: { roleOfferWidenMin?: number | null; roleOfferAlertMin?: number | null } | null | undefined): { widenMin: number; alertMin: number } {
  const clamp = (v: number | null | undefined, d: number) =>
    v == null || !Number.isFinite(v) ? d : Math.min(ROLE_OFFER_MAX_MINUTES, Math.max(ROLE_OFFER_MIN_MINUTES, Math.round(v)));
  const widenMin = clamp(space?.roleOfferWidenMin, ROLE_OFFER_WIDEN_MIN);
  // The alert never comes before the widening — the wider wave deserves its chance.
  const alertMin = Math.max(widenMin, clamp(space?.roleOfferAlertMin, ROLE_OFFER_ALERT_MIN));
  return { widenMin, alertMin };
}

/** Waves: 0 offered to the free · 1 widened to everyone working today · 2 the creator was told. */
export type RoleWave = 0 | 1 | 2;

/**
 * Which wave a still-open task should be in by now. Urgent goes straight to
 * the widest offer; the creator is still told on the alert time.
 */
export function dueWave(
  task: { openedAt: Date | string; priority?: string | null },
  now: Date,
  timings: { widenMin: number; alertMin: number },
): RoleWave {
  const opened = new Date(task.openedAt).getTime();
  const mins = (now.getTime() - opened) / 60_000;
  if (mins >= timings.alertMin) return 2;
  if (task.priority === 'URGENT' || mins >= timings.widenMin) return 1;
  return 0;
}

/**
 * Who a wave reaches. Wave 0: the FREE. Wave 1: everyone working today (free,
 * busy, or rostered and not yet clocked in) — never someone on leave.
 * People already told, and people already on the task, are left out.
 */
export function waveRecipients<T extends RoleCandidate>(
  ranked: readonly (T & { state: CandidateState })[],
  wave: 0 | 1,
  exclude: ReadonlySet<string> = new Set(),
): string[] {
  return ranked
    .filter((c) => !exclude.has(c.userId))
    .filter((c) => (wave === 0 ? c.state === 'FREE' : c.state !== 'ON_LEAVE' && (c.state !== 'NOT_WORKING' || c.rosteredToday)))
    .map((c) => c.userId);
}

/** Is this task still asking its role for people? */
export function isOpenToRole(t: { openRoleId?: string | null; openSpotsLeft?: number | null; status?: string | null }): boolean {
  if (!t.openRoleId || (t.openSpotsLeft ?? 0) <= 0) return false;
  // Finished by any name a workflow gives it (the shared rule, not a list of three).
  return !isWorkOver(String(t.status ?? ''));
}

/** "1 of 2 taken" — for a screen. */
export function spotsTaken(t: { openSpots?: number | null; openSpotsLeft?: number | null }): { taken: number; of: number } {
  const of = Math.max(0, t.openSpots ?? 0);
  return { taken: Math.max(0, of - Math.max(0, t.openSpotsLeft ?? 0)), of };
}

/** Clean a requested number of people: 1…ROLE_SPOTS_MAX, default 1. */
export function parseRoleSpots(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(ROLE_SPOTS_MAX, Math.max(1, Math.round(n)));
}

/** Whole minutes between opening and a take — what the report averages. */
export function minutesWaited(openedAt: Date | string | null | undefined, takenAt: Date): number | null {
  if (!openedAt) return null;
  return Math.max(0, Math.round((takenAt.getTime() - new Date(openedAt).getTime()) / 60_000));
}

/** Straight-line km — the shared haversine (metres), so ranking and the geofence agree. */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineDistance(a.lat, a.lng, b.lat, b.lng) / 1000;
}
