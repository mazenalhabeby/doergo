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
  if (app === 'google') return buildGoogleMapsUrl(opts.start, opts.orderedStops, opts.end);
  const target = opts.nextStop ?? opts.orderedStops[0] ?? opts.end;
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
