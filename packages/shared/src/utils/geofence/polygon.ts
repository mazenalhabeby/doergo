/** A drawn boundary's limits, checking and parsing one, and the radius slider's scale. */
import type { LatLng } from '../geo-point';
import { ATTENDANCE_CONSTANTS } from '../../constants/attendance';
import { toLocalMetres } from './site';

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
