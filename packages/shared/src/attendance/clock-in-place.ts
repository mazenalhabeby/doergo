/**
 * Where a clock-in WAS — for the words a screen writes beside it ("on the site", "outside the site", "away from a
 * site"). `clockInWithinGeofence` answers a different question: was the clock-in ADMITTED without a flag. With the
 * ring switched off (a workspace without one, or a worker set to work there "in the field" — clock review D1) a
 * clock-in 300 km away is admitted, and reading the flag as a place said "on the site". The point is kept on the
 * entry, so the place is the one site rule applied to it — no request, works offline.
 */
import { isAtSite, type SiteZone } from '../utils/geofence/site';
import { parseGeofencePolygon } from '../utils/geofence/polygon';

export type ClockInPlace = 'ON_SITE' | 'OUTSIDE' | 'AWAY';

export interface ClockInPlaceEntry {
  isRemote?: boolean | null;
  clockInWithinGeofence?: boolean | null;
  clockInLat?: number | null;
  clockInLng?: number | null;
  clockInAccuracy?: number | null;
  location?: {
    lat?: number | null;
    lng?: number | null;
    geofenceRadius?: number | null;
    geofencePolygon?: unknown;
  } | null;
}

/**
 * AWAY   — an away day, or admitted with no ring while the point is not at the site;
 * OUTSIDE — flagged: clocked in outside a ring that was on;
 * ON_SITE — at the site (or nothing to judge it against: no pin, no position).
 */
export function clockInPlace(entry: ClockInPlaceEntry): ClockInPlace {
  if (entry.isRemote) return 'AWAY';
  if (entry.clockInWithinGeofence === false) return 'OUTSIDE';
  const loc = entry.location;
  const lat = entry.clockInLat;
  const lng = entry.clockInLng;
  // No position recorded (0,0 is the "no fix" placeholder) or no site to judge it against.
  if (!loc || lat == null || lng == null || (lat === 0 && lng === 0)) return 'ON_SITE';
  const zone: SiteZone = {
    lat: loc.lat ?? null,
    lng: loc.lng ?? null,
    geofenceRadius: loc.geofenceRadius ?? 0,
    geofencePolygon: parseGeofencePolygon(loc.geofencePolygon),
  };
  const at = isAtSite({ lat, lng, accuracy: entry.clockInAccuracy ?? 0 }, zone);
  return !at.evaluable || at.inside ? 'ON_SITE' : 'AWAY';
}
