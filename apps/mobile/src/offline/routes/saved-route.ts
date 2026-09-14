import type { OptimizedRoute } from '@hbcfield/shared/client';

/**
 * The day's planned route, kept on the phone.
 *
 * Planning is done with signal — in the yard, in the morning — and driving is
 * where it goes. So the last plan is kept, and opening the planner in a dead
 * zone shows the order already worked out instead of a spinner and an error.
 * The navigation apps carry their own offline maps; what they need from us is
 * the order.
 *
 * A plan belongs to the day it was made and to the stops it was made for: a
 * plan from yesterday, or one that includes a job no longer on the list, is not
 * restored.
 */
export interface SavedRoute {
  /** Local calendar day it was planned, "YYYY-MM-DD". */
  day: string;
  savedAt: number;
  route: OptimizedRoute;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const SAVED_ROUTE_KEY = (memberId: string) => `route_plan_v1_${memberId}`;

export function localDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function saveRoute(storage: KeyValueStorage, memberId: string, route: OptimizedRoute, now = Date.now()): Promise<void> {
  const saved: SavedRoute = { day: localDay(now), savedAt: now, route };
  await storage.setItem(SAVED_ROUTE_KEY(memberId), JSON.stringify(saved)).catch(() => undefined);
}

/** Today's plan, if every stop in it is still one of the member's stops. */
export async function restoreRoute(
  storage: KeyValueStorage,
  memberId: string,
  stopIds: readonly string[],
  now = Date.now(),
): Promise<OptimizedRoute | null> {
  try {
    const raw = await storage.getItem(SAVED_ROUTE_KEY(memberId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedRoute;
    if (saved.day !== localDay(now) || !Array.isArray(saved.route?.order) || saved.route.order.length === 0) return null;
    const current = new Set(stopIds);
    return saved.route.order.every((id) => current.has(id)) ? saved.route : null;
  } catch {
    return null;
  }
}
