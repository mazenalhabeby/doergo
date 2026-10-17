import { straightLineRoute, type LatLng, type OptimizedRoute, type RouteStop } from '@hbcfield/shared/client';
import { routesApi } from '../../lib/api';
import { isUnreachable } from '../actions/unreachable';
import { sealedStore } from '../../lib/sealed-stores';
import { restoreRoute, saveRoute } from './saved-route';

/** ⚠️ Sealed per member: the day's stops are clients' addresses and coordinates. A plaintext plan from before is re-sealed on first touch. */
const planStore = (memberId: string) => sealedStore('route-plan', memberId);

/**
 * Plan the day — ONE implementation, for the route planner and the home's
 * Today's route card.
 *
 * Asks the server (a routing engine — ⚠️ one billed request per plan). With no
 * signal it orders the stops on the phone instead (`straightLineRoute`, no road
 * geometry), so a local order beats a spinner. Either way the plan is kept for
 * the day, so the card and the planner show the same one.
 *
 * With no position the first stop is the start (the planner's rule): the plan
 * then covers the rest.
 */
export async function planDay(memberId: string, start: LatLng | null, stops: readonly RouteStop[]): Promise<OptimizedRoute | null> {
  /*
    ⚠️ ONLY WHAT THE ROUTE API ACCEPTS. The gateway refuses unknown fields
    (whitelist validation), so a caller's richer stop — a booked time, an
    arrival — must never ride along. It also means nothing beyond the place
    and its label leaves the phone.
  */
  const clean: RouteStop[] = stops.map((s) => ({
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    ...(s.label ? { label: s.label } : {}),
    ...(s.address ? { address: s.address } : {}),
  }));
  const from = start ? { lat: start.lat, lng: start.lng } : clean[0] ? { lat: clean[0].lat, lng: clean[0].lng } : null;
  const list = start ? clean : clean.slice(1);
  if (!from || list.length === 0) return null;
  let route: OptimizedRoute;
  try {
    route = await routesApi.optimize({ start: from, stops: list });
  } catch (e) {
    if (!isUnreachable(e)) throw e;
    route = straightLineRoute({ start: from, stops: list });
  }
  await saveRoute(planStore(memberId), memberId, route);
  return route;
}

/** Today's plan for these stops, from the phone — the same store `planDay` writes. */
export const todaysPlan = (memberId: string, stopIds: readonly string[]) => restoreRoute(planStore(memberId), memberId, stopIds);
