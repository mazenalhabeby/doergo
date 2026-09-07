/**
 * Geofence — is this position at the site?
 *
 * A site is either a CIRCLE (a point and a radius) or a BOUNDARY (the shape of
 * the property, drawn on a map). The circle is right for a shop with a door on
 * the street. It is wrong for anything with a yard or several buildings,
 * because the address geocodes to the front door and the circle is measured
 * from there: widen it and the neighbour's car park is inside, narrow it and
 * your own warehouse is out.
 *
 * `isAtSite` is the ONE place that answers the question. Clock-in, clock-out,
 * the excursion sweep and the phone's "within range" badge all call it, so they
 * cannot drift apart — they did drift before, when each site compared a
 * distance to a radius inline.
 */

/*
  `LatLng` is defined once, in route-nav.ts, and imported here. A second
  identical interface would compile and then quietly diverge the first time one
  of them gained a field.
*/
import type { LatLng } from './route-nav';
import { ATTENDANCE_CONSTANTS } from '../constants/attendance';

export type { LatLng };

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

/** Whether a site enforces a zone at all. */
export function siteEnforcesZone(site: SiteZone): boolean {
  if (site.geofencePolygon && site.geofencePolygon.length >= 3) return true;
  return site.lat != null && site.lng != null && site.geofenceRadius > 0;
}

/* ── limits ───────────────────────────────────────────────────────────────── */

/**
 * A boundary is drawn by an admin and stored as free-form JSON, so it is
 * untrusted input and gets checked on the way in — not on the way out, where a
 * bad shape has already been saved and is already deciding people's pay.
 */
export const GEOFENCE_POLYGON_LIMITS = {
  MIN_POINTS: 3,
  /** Enough for any real property outline; bounds the stored JSON and the scan. */
  MAX_POINTS: 60,
  /**
   * A clock-in zone larger than this is not a site, it is a district — and a
   * boundary drawn around half a city would quietly switch the control off
   * while still looking configured. 5 km² comfortably contains the largest
   * industrial campus.
   */
  MAX_AREA_SQM: 5_000_000,
} as const;

export type GeofencePolygonError =
  | 'TOO_FEW_POINTS'
  | 'TOO_MANY_POINTS'
  | 'INVALID_COORDINATE'
  | 'AREA_TOO_LARGE';

/** Square metres enclosed by a ring, via the shoelace formula in local metres. */
export function polygonAreaSqm(ring: LatLng[]): number {
  const origin = ring[0];
  if (ring.length < 3 || !origin) return 0;
  const pts = ring.map((r) => toLocalMetres(r, origin));
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    if (!cur || !prev) continue;
    twice += prev.x * cur.y - cur.x * prev.y;
  }
  return Math.abs(twice) / 2;
}

/**
 * Validate a drawn boundary. Returns the cleaned ring, or the reason it is
 * refused — never a half-accepted shape.
 */
export function validateGeofencePolygon(
  input: unknown,
): { ok: true; ring: LatLng[] } | { ok: false; error: GeofencePolygonError } {
  if (!Array.isArray(input)) return { ok: false, error: 'TOO_FEW_POINTS' };

  const ring: LatLng[] = [];
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'INVALID_COORDINATE' };
    const { lat, lng } = raw as Record<string, unknown>;
    if (
      typeof lat !== 'number' || typeof lng !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) {
      return { ok: false, error: 'INVALID_COORDINATE' };
    }
    ring.push({ lat, lng });
  }

  // A ring that repeats its first point at the end is the GeoJSON convention;
  // the maths here closes the ring itself, so the duplicate is dropped rather
  // than counted against the point budget or the area.
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first && last && first.lat === last.lat && first.lng === last.lng) {
    ring.pop();
  }

  if (ring.length < GEOFENCE_POLYGON_LIMITS.MIN_POINTS) return { ok: false, error: 'TOO_FEW_POINTS' };
  if (ring.length > GEOFENCE_POLYGON_LIMITS.MAX_POINTS) return { ok: false, error: 'TOO_MANY_POINTS' };
  if (polygonAreaSqm(ring) > GEOFENCE_POLYGON_LIMITS.MAX_AREA_SQM) {
    return { ok: false, error: 'AREA_TOO_LARGE' };
  }

  return { ok: true, ring };
}

/**
 * Read a boundary back out of the database column.
 *
 * The column is JSON, so its contents are whatever was there — including
 * whatever an older version of this code, a restored backup or a hand-edited
 * row put in it. Anything that is not a usable ring returns null, which means
 * "fall back to the radius" rather than "nobody can clock in here". Enforcement
 * failing OPEN to the previous behaviour is the right default: the alternative
 * is a site nobody can clock into and no obvious reason why.
 */
export function parseGeofencePolygon(value: unknown): LatLng[] | null {
  if (!Array.isArray(value) || value.length < GEOFENCE_POLYGON_LIMITS.MIN_POINTS) return null;
  const ring: LatLng[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { lat, lng } = raw as Record<string, unknown>;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    ring.push({ lat, lng });
  }
  return ring.length >= GEOFENCE_POLYGON_LIMITS.MIN_POINTS ? ring : null;
}

/* ------------------------------------------------------------------------- *
 * The radius slider's scale
 *
 * These map a radius to a position on a slider track and back. They are here,
 * beside the limits they read, rather than inside the form that renders the
 * control — the mapping is arithmetic with a correct answer, and arithmetic
 * buried in a component is arithmetic nobody can test.
 *
 * The scale is LOGARITHMIC, and that is the whole point. Raising the cap from
 * 100m to 500m so a campus could be expressed had a side effect on the control:
 * a 50m radius that had sat at 44% of the track suddenly sat at 8%, with the
 * entire 10-100m range — where nearly every site lives — squeezed into the
 * first fifth. The number never changed, but the handle jumped a long way, and
 * choosing 50 over 60 by dragging became impossible.
 *
 * A log scale spends the track where the values are: half of it covers 10-75m,
 * and the coarse end past 100m steps in 25s, because nobody is choosing between
 * a 300m site and a 305m one. The typed field stays exact for anyone who wants
 * a specific number.
 * ------------------------------------------------------------------------- */

/** Slider granularity. The track is integer positions 0..this. */
export const RADIUS_SLIDER_STEPS = 100;

const LN_MIN = Math.log(ATTENDANCE_CONSTANTS.MIN_GEOFENCE_RADIUS);
const LN_SPAN = Math.log(ATTENDANCE_CONSTANTS.MAX_GEOFENCE_RADIUS) - LN_MIN;

/** Where on the track a given radius sits. */
export function radiusToSliderPosition(metres: number): number {
  const clamped = Math.min(
    ATTENDANCE_CONSTANTS.MAX_GEOFENCE_RADIUS,
    Math.max(
      ATTENDANCE_CONSTANTS.MIN_GEOFENCE_RADIUS,
      Number.isFinite(metres) && metres > 0 ? metres : ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS,
    ),
  );
  return Math.round(((Math.log(clamped) - LN_MIN) / LN_SPAN) * RADIUS_SLIDER_STEPS);
}

/** What radius a track position means, snapped to a number a person would pick. */
export function sliderPositionToRadius(position: number): number {
  const pos = Math.min(RADIUS_SLIDER_STEPS, Math.max(0, Number.isFinite(position) ? position : 0));
  const raw = Math.exp(LN_MIN + (pos / RADIUS_SLIDER_STEPS) * LN_SPAN);
  // 5m steps where precision matters, 25m past 100m where it does not.
  const snapped = raw < 100 ? Math.round(raw / 5) * 5 : Math.round(raw / 25) * 25;
  return Math.min(
    ATTENDANCE_CONSTANTS.MAX_GEOFENCE_RADIUS,
    Math.max(ATTENDANCE_CONSTANTS.MIN_GEOFENCE_RADIUS, snapped),
  );
}
