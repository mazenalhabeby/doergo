/**
 * The phone's smarter day — pure rules, no React (docs/plans/clock-attendance-2026-10.md, step 3).
 *
 * Every rule here only CHOOSES what to offer; nothing is decided for the person
 * and every action still goes through the route it always used. Each reads its
 * input defensively: a server that does not send a field yet means "offer
 * nothing new", never a guess.
 */
import type { ClockInChoice, ClockInCandidate, TimeEntry } from '@hbcfield/shared/client';

const MIN = 60_000;

/** Minutes away after the planned end before "You left at … — clock out then?" is offered. */
export const FORGOT_OFFER_AFTER_MIN = 25;

/**
 * No picker when today's shift names the workspace: the rota already said where.
 * Only in AUTO mode (a member who chose "always ask" is always asked), and only
 * when that workspace is one the server would take.
 */
export function preferShiftWorkspace<T extends ClockInCandidate>(
  choice: ClockInChoice<T>,
  shiftSpaceId: string | null | undefined,
  pick: 'AUTO' | 'ASK',
): ClockInChoice<T> {
  if (choice.kind !== 'ask' || pick !== 'AUTO' || !shiftSpaceId) return choice;
  const named = choice.ranked.find((r) => r.location.id === shiftSpaceId);
  return named ? { kind: 'auto', location: named.location, why: 'ONLY_ONE' } : choice;
}

/**
 * A refusal the person can turn into a request: they are away from a site that wants them on it.
 * The server's codes, and the phone's own when it answered with no signal (`OUTSIDE_SITE`).
 */
export function isAwayRefusal(code: string | null | undefined): boolean {
  return code === 'OUTSIDE_GEOFENCE' || code === 'AWAY_NOT_ALLOWED' || code === 'OUTSIDE_SITE';
}

/** When the person left the site on this shift and has not come back — only what the server said. */
export function leftSiteAt(entry: Pick<TimeEntry, 'clockInAt'> & { leftSiteAt?: string | null }): Date | null {
  const raw = entry.leftSiteAt;
  if (!raw) return null;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime()) || at.getTime() < new Date(entry.clockInAt).getTime()) return null;
  return at;
}

/** When "You left at … — clock out then?" becomes due, or null when it never will (no end, a daily limit, not away). */
export function forgotOfferDueAt(
  entry: Pick<TimeEntry, 'clockInAt' | 'expectedClockOutAt' | 'endIsDailyLimit'> & { leftSiteAt?: string | null },
): Date | null {
  if (!entry.expectedClockOutAt || entry.endIsDailyLimit) return null;
  const left = leftSiteAt(entry);
  if (!left) return null;
  return new Date(Math.max(left.getTime(), new Date(entry.expectedClockOutAt).getTime()) + FORGOT_OFFER_AFTER_MIN * MIN);
}

/**
 * "You left the Warehouse at 16:42 — clock out at 16:42?"
 *
 * Offered once the shift's planned end has passed and the person has been away
 * for FORGOT_OFFER_AFTER_MIN since the later of leaving and the planned end. A
 * session with no planned end, or a daily allowance, is never offered: nobody
 * forgot to leave a shift that has no end.
 */
export function forgotClockOutOffer(
  entry: Pick<TimeEntry, 'clockInAt' | 'expectedClockOutAt' | 'endIsDailyLimit'> & { leftSiteAt?: string | null },
  now: Date,
): { leftAt: Date } | null {
  const due = forgotOfferDueAt(entry);
  const left = leftSiteAt(entry);
  return due && left && now.getTime() >= due.getTime() ? { leftAt: left } : null;
}

/** The workspaces the phone's OS geofence last saw the member inside — from the automatic clock's store, never a GPS fix. */
export function insideOf(places: Record<string, { inside: boolean }>): ReadonlySet<string> {
  return new Set(Object.entries(places).filter(([, p]) => p.inside).map(([id]) => id));
}
