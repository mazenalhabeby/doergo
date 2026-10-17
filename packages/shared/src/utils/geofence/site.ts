/** Is this person at the site: distance, a drawn boundary, the arming radius. */
import type { LatLng } from '../geo-point';

/** Metres per degree of latitude. Constant enough at any latitude. */
const M_PER_DEG_LAT = 111_320;

/** How a site defines its clock-in zone. */
export interface SiteZone {
  lat: number | null;
  lng: number | null;
  geofenceRadius: number;
  /** Closed ring of points. When present it wins over the radius. */
  geofencePolygon?: LatLng[] | null;
}

export interface AtSiteResult {
  /** Whether the position counts as being at the site. */
  inside: boolean;
  /**
   * Metres past the edge — 0 when inside, positive when outside. Reported to
   * the member and stored on flagged entries, so it must mean the same thing
   * for both zone shapes: distance to the BOUNDARY, not to the centre.
   */
  metresOutside: number;
  /** Straight-line metres to the site's pin. Display only. */
  distanceToCentre: number | null;
  /** False when the site has no coordinates at all — then nothing is enforced. */
  evaluable: boolean;
}

/* ── distance ─────────────────────────────────────────────────────────────── */

/** Great-circle metres between two positions. */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Project to local metres around an origin.
 *
 * A site is at most a few hundred metres across, so treating that patch as flat
 * is accurate to well under a metre — far below GPS error. It lets the polygon
 * maths be ordinary plane geometry instead of spherical trigonometry, which is
 * the difference between code that can be read and code that is trusted.
 */
function toLocalMetres(p: LatLng, origin: LatLng): { x: number; y: number } {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (p.lng - origin.lng) * mPerDegLng,
    y: (p.lat - origin.lat) * M_PER_DEG_LAT,
  };
}

/* ── polygon ──────────────────────────────────────────────────────────────── */

/**
 * Ray casting: count how many edges a ray to the east crosses. Odd is inside.
 *
 * The `(yi > y) !== (yj > y)` test counts each edge on exactly one side of its
 * endpoints, which is what stops a ray passing exactly through a vertex from
 * being counted twice and flipping the answer.
 */
export function isPointInPolygon(point: LatLng, ring: LatLng[]): boolean {
  const origin = ring[0];
  if (ring.length < 3 || !origin) return false;
  const p = toLocalMetres(point, origin);
  const pts = ring.map((r) => toLocalMetres(r, origin));

  let inside = false;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    if (!cur || !prev) continue;
    const { x: xi, y: yi } = cur;
    const { x: xj, y: yj } = prev;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest metres from a point to a line segment, in local metres. */
function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  // A degenerate edge (two identical points) is just a point.
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest metres from a position to the boundary itself, inside or out. */
export function distanceToPolygonEdge(point: LatLng, ring: LatLng[]): number {
  const origin = ring[0];
  if (ring.length < 2 || !origin) return Infinity;
  const p = toLocalMetres(point, origin);
  const pts = ring.map((r) => toLocalMetres(r, origin));

  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    if (!cur || !prev) continue;
    min = Math.min(min, distanceToSegment(p, prev, cur));
  }
  return min;
}

/* ── the one question ─────────────────────────────────────────────────────── */

/**
 * Is this position at the site?
 *
 * `accuracyMetres` is the GPS error the device reported, and it WIDENS the zone
 * rather than being ignored. A fix that is plausibly on site passes instead of
 * being refused for being fuzzy — which matters most exactly where the signal
 * is worst, next to and inside buildings. It is deliberately generous: the
 * consequence of wrongly refusing somebody who is standing at work is that they
 * cannot start their day, and the consequence of wrongly accepting is a flagged
 * entry a human reviews.
 */
export function isAtSite(
  position: LatLng & { accuracy?: number | null },
  site: SiteZone,
): AtSiteResult {
  const tolerance = Math.max(0, position.accuracy ?? 0);

  const ring = site.geofencePolygon;
  if (ring && ring.length >= 3) {
    const centre = site.lat != null && site.lng != null
      ? haversineDistance(position.lat, position.lng, site.lat, site.lng)
      : null;

    if (isPointInPolygon(position, ring)) {
      return { inside: true, metresOutside: 0, distanceToCentre: centre, evaluable: true };
    }
    const edge = distanceToPolygonEdge(position, ring);
    return {
      inside: edge <= tolerance,
      metresOutside: Math.max(0, edge - tolerance),
      distanceToCentre: centre,
      evaluable: true,
    };
  }

  // No boundary drawn: the circle, exactly as before.
  if (site.lat == null || site.lng == null || site.geofenceRadius <= 0) {
    return { inside: true, metresOutside: 0, distanceToCentre: null, evaluable: false };
  }
  const distance = haversineDistance(position.lat, position.lng, site.lat, site.lng);
  const allowed = site.geofenceRadius + tolerance;
  return {
    inside: distance <= allowed,
    metresOutside: Math.max(0, distance - allowed),
    distanceToCentre: distance,
    evaluable: true,
  };
}

/**
 * The circle an OS geofence is armed with for a site (iOS/Android geofences are
 * circles only): the radius, or — when a boundary is drawn — the smallest circle
 * round the site's pin that holds every corner of it, rounded up to a metre.
 *
 * ⚠️ Only for WAKING the phone. Whether the person is actually at the site is
 * still `isAtSite`, which honours the drawn boundary exactly.
 */
export function geofenceArmRadius(site: SiteZone): number {
  const ring = site.geofencePolygon;
  if (ring && ring.length >= 3 && site.lat != null && site.lng != null) {
    let max = 0;
    for (const p of ring) max = Math.max(max, haversineDistance(site.lat, site.lng, p.lat, p.lng));
    return Math.ceil(max);
  }
  return site.geofenceRadius;
}

/** Whether a site enforces a zone at all. */
export function siteEnforcesZone(site: SiteZone): boolean {
  if (site.geofencePolygon && site.geofencePolygon.length >= 3) return true;
  return site.lat != null && site.lng != null && site.geofenceRadius > 0;
}

export { toLocalMetres };
