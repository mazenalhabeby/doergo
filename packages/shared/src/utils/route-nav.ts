// ═══════════════════════════════════════════════════════════════════════════
//  Route navigation helpers (pure, runtime-agnostic — web + mobile + server)
//
//  Two jobs:
//   1) Hand an OPTIMIZED, ordered set of stops to a navigation app. Google Maps
//      supports a true multi-stop deep link that carries our optimized order;
//      Waze and Apple Maps are single-destination, so those get a stop-by-stop
//      "navigate to next stop" pattern.
//   2) A dependency-free nearest-neighbour fallback ordering, used server-side
//      when the OSRM /trip engine is unavailable.
// ═══════════════════════════════════════════════════════════════════════════

import { haversineDistance } from './geofence';

export type NavApp = 'google' | 'waze' | 'apple';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NavStop extends LatLng {
  label?: string;
  address?: string;
}

const ll = (p: LatLng) => `${p.lat},${p.lng}`;

/**
 * Google Maps multi-stop deep link. Carries OUR optimized order (Google will not
 * re-order unless you pass its own optimize flag, which we don't). Waypoints are
 * the intermediate stops; the final stop is the `destination`. Works on web,
 * Android and iOS (universal `google.com/maps/dir/` link).
 *
 * origin → waypoint[0] → … → waypoint[n] → destination
 */
export function buildGoogleMapsUrl(
  start: LatLng,
  orderedStops: LatLng[],
  end?: LatLng,
): string {
  if (orderedStops.length === 0 && !end) return '';
  const all = [...orderedStops];
  const destination = end ?? all.pop()!; // last stop is the destination when no explicit end
  const params = new URLSearchParams({
    api: '1',
    origin: ll(start),
    destination: ll(destination),
    travelmode: 'driving',
  });
  if (all.length > 0) {
    // Pipe-separated intermediate waypoints, in our order.
    params.set('waypoints', all.map(ll).join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Waze is single-destination only — no multi-stop. Use this per-stop in a
 * "navigate to the next stop, then advance" flow.
 */
export function buildWazeUrl(stop: LatLng): string {
  const params = new URLSearchParams({ ll: ll(stop), navigate: 'yes' });
  return `https://waze.com/ul?${params.toString()}`;
}

/**
 * Apple Maps single-destination link (also single-stop). `saddr`/`daddr` accept
 * "lat,lng". Used for the stop-by-stop pattern on iOS.
 */
export function buildAppleMapsUrl(stop: LatLng, start?: LatLng): string {
  const params = new URLSearchParams({ daddr: ll(stop), dirflg: 'd' });
  if (start) params.set('saddr', ll(start));
  return `https://maps.apple.com/?${params.toString()}`;
}

/**
 * Build the right navigation URL for the chosen app. For Google we can pass the
 * whole ordered trip; for Waze/Apple we can only target a single `nextStop`.
 */
export function buildNavUrl(
  app: NavApp,
  opts: { start: LatLng; orderedStops: LatLng[]; end?: LatLng; nextStop?: LatLng },
): string {
  /*
    ⚠️ A named `nextStop` means THAT stop, whichever app is chosen.

    Google used to ignore it and rebuild the entire multi-stop trip, so the
    arrow beside the fourth stop reopened the whole day and started the driver
    at the first one. The bug only showed with Google selected, which is the
    default on Android and the likeliest choice everywhere.
  */
  if (opts.nextStop) {
    if (app === 'google') return buildGoogleMapsUrl(opts.start, [opts.nextStop]);
    return app === 'waze'
      ? buildWazeUrl(opts.nextStop)
      : buildAppleMapsUrl(opts.nextStop, opts.start);
  }

  // No single stop named: Google takes the whole trip, the others can only be
  // pointed at the first one.
  if (app === 'google') return buildGoogleMapsUrl(opts.start, opts.orderedStops, opts.end);
  const target = opts.orderedStops[0] ?? opts.end;
  if (!target) return '';
  return app === 'waze' ? buildWazeUrl(target) : buildAppleMapsUrl(target, opts.start);
}

/** Whether the chosen app can consume the full multi-stop order in one link. */
export function supportsMultiStop(app: NavApp): boolean {
  return app === 'google';
}

/**
 * Nearest-neighbour ordering fallback (no external service). Greedy: from the
 * start, repeatedly hop to the closest unvisited stop by straight-line distance.
 * Good enough as a graceful fallback when the OSRM /trip engine is unavailable;
 * returns the input `stops` order-indices reordered.
 *
 * Returns the indices into `stops` in visit order.
 */
export function nearestNeighbourOrder(start: LatLng, stops: LatLng[]): number[] {
  const remaining = stops.map((_, i) => i);
  const order: number[] = [];
  let cursor: LatLng = start;
  while (remaining.length > 0) {
    let bestPos = 0;
    let bestDist = Infinity;
    for (let k = 0; k < remaining.length; k++) {
      const s = stops[remaining[k]!]!;
      const d = haversineDistance(cursor.lat, cursor.lng, s.lat, s.lng);
      if (d < bestDist) {
        bestDist = d;
        bestPos = k;
      }
    }
    const chosen = remaining.splice(bestPos, 1)[0]!;
    order.push(chosen);
    cursor = stops[chosen]!;
  }
  return order;
}

/**
 * Decode Google's encoded-polyline format into coordinates.
 *
 * Google returns a route's road geometry as a compact ASCII string rather than
 * a list of points — thousands of coordinates would otherwise be megabytes on
 * a phone. Every consumer of a Google route needs this, so it lives here beside
 * the other route maths rather than in whichever service decoded one first.
 *
 * Returns GeoJSON order — [lng, lat] — because that is what the rest of this
 * codebase already passes around as `geometry.coordinates`, and quietly
 * swapping the pair is the classic way a route ends up drawn in the sea off
 * Somalia.
 *
 * @param precision 5 for Google's default; OSRM's `polyline6` uses 6.
 */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  if (!encoded) return [];
  const factor = Math.pow(10, precision);
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Each coordinate is a zig-zag-encoded delta from the previous one, in
    // 5-bit chunks with a continuation bit.
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    out.push([lng / factor, lat / factor]);
  }
  return out;
}

/**
 * How to ask the device whether a navigation app is actually installed.
 *
 * ⚠️ The `build*Url` functions above all return https universal links, and
 * that is right for OPENING — the installed app claims the link, and a device
 * without it still gets the web map instead of an error. It is useless for
 * ASKING: `canOpenURL` on an https URL is always true, because a browser can
 * always open it. So the probe is the app's own scheme and the destination is
 * still the universal link.
 *
 * ⚠️⚠️ On iOS a scheme must be listed in `LSApplicationQueriesSchemes` or
 * `canOpenURL` returns false for it — no error, no warning, just "not
 * installed" for everything. That list is native config, so it ships in a
 * BUILD and never in an over-the-air update. The degradation is deliberate and
 * safe: nothing detected means no chooser, and the universal link opens
 * whichever app the system prefers.
 */
export const NAV_APP_PROBES: Record<NavApp, string | null> = {
  // Apple Maps is part of iOS and cannot be removed, so there is nothing to
  // ask; on Android it does not exist at all. Platform decides, not a probe.
  apple: null,
  google: 'comgooglemaps://',
  waze: 'waze://',
};

/** Display name, for a chooser the person reads rather than a settings value. */
export const NAV_APP_LABELS: Record<NavApp, string> = {
  apple: 'Apple Maps',
  google: 'Google Maps',
  waze: 'Waze',
};

/**
 * Which apps could possibly be on this platform, before asking the device.
 *
 * Apple Maps exists only on iOS; offering it on Android is offering something
 * that can never work. Google Maps is standard on Android but optional on iOS,
 * so it is probed on both.
 */
export function navAppCandidates(platform: 'ios' | 'android'): NavApp[] {
  return platform === 'ios' ? ['apple', 'google', 'waze'] : ['google', 'waze'];
}

/**
 * Is this app present without asking? Apple Maps on iOS is the only one — it
 * ships with the system and cannot be uninstalled.
 */
export function isAlwaysAvailable(app: NavApp, platform: 'ios' | 'android'): boolean {
  return app === 'apple' && platform === 'ios';
}

/**
 * How close counts as "standing at this stop".
 *
 * Generous on purpose. A phone's fix drifts, a delivery entrance can be a
 * street away from the pin somebody dropped, and a driver parks where there is
 * space. The cost of the two mistakes is not symmetric: too tight and the
 * driver is sent to navigate to a building they are inside, which is absurd
 * and obvious; too loose and the route skips a stop, which is a missed
 * customer nobody notices until the end of the day.
 *
 * So it is wide enough to absorb a car park and no wider — and only ever
 * applied to the NEAREST stop, so two shops on the same street cannot both
 * match.
 */
export const AT_STOP_RADIUS_METRES = 150;

/**
 * Where the driver has got to, judged by where they are standing.
 *
 * "Start navigation" pressed at the second stop should continue to the third,
 * not replay the morning. The product already records an arrival when a task
 * goes En Route -> Arrived, but a driver who simply drove there without
 * touching their phone has no such record — and they are the ones most likely
 * to press this button.
 *
 * So position is read as evidence too: the nearest stop, if it is close
 * enough, is one they have reached. Everything up to and including it is
 * behind them; what remains keeps the order the optimizer chose. Nothing is
 * re-optimised — a route that reshuffles itself whenever it is opened is one
 * nobody can follow or check against the plan they agreed.
 */
export function stopsAheadOf<T extends { id: string; lat: number; lng: number }>(
  position: LatLng | null | undefined,
  ordered: T[],
  arrivedIds: ReadonlySet<string> = new Set(),
): T[] {
  const notArrived = ordered.filter((s) => !arrivedIds.has(s.id));
  if (!position || notArrived.length === 0) return notArrived;

  // The nearest stop, and only it, may be the one they are standing at.
  let nearestIdx = -1;
  let nearestMetres = Infinity;
  for (let i = 0; i < notArrived.length; i++) {
    const s = notArrived[i]!;
    const d = haversineDistance(position.lat, position.lng, s.lat, s.lng);
    if (d < nearestMetres) {
      nearestMetres = d;
      nearestIdx = i;
    }
  }

  // Not at any of them: they are between stops, so the whole remainder stands.
  if (nearestIdx < 0 || nearestMetres > AT_STOP_RADIUS_METRES) return notArrived;

  /*
    Standing at one: it and everything BEFORE it in the plan are behind them.

    Earlier stops are dropped as well, deliberately. Reaching stop three means
    one and two were either done or deliberately skipped; either way, sending
    somebody backwards through the morning is not what they asked for by
    pressing continue.
  */
  return notArrived.slice(nearestIdx + 1);
}
