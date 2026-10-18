/** Handing stops to a navigation app: the Google, Waze and Apple links, and which apps can take several stops. */
import type { LatLng } from '../geo-point';

export type NavApp = 'google' | 'waze' | 'apple';

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
  /** null → no origin: Google starts from where the phone is (an address is enough to drive to). */
  start: LatLng | null,
  orderedStops: LatLng[],
  end?: LatLng,
): string {
  if (orderedStops.length === 0 && !end) return '';
  const all = [...orderedStops];
  const destination = end ?? all.pop()!; // last stop is the destination when no explicit end
  const params = new URLSearchParams({
    api: '1',
    ...(start ? { origin: ll(start) } : {}),
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
  opts: { start: LatLng | null; orderedStops: LatLng[]; end?: LatLng; nextStop?: LatLng },
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
      : buildAppleMapsUrl(opts.nextStop, opts.start ?? undefined);
  }

  // No single stop named: Google takes the whole trip, the others can only be
  // pointed at the first one.
  if (app === 'google') return buildGoogleMapsUrl(opts.start, opts.orderedStops, opts.end);
  const target = opts.orderedStops[0] ?? opts.end;
  if (!target) return '';
  return app === 'waze' ? buildWazeUrl(target) : buildAppleMapsUrl(target, opts.start ?? undefined);
}

/** Whether the chosen app can consume the full multi-stop order in one link. */
export function supportsMultiStop(app: NavApp): boolean {
  return app === 'google';
}
