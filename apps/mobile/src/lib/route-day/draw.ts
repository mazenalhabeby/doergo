/** Drawing the route: projection, path, split and smoothing (moved here unchanged) */
import type { LatLng } from '@hbcfield/shared/client';
import { isLatLng, type DayStop } from './stops';

interface Projection { x: (p: LatLng) => number; y: (p: LatLng) => number }

/**
 * Fit a set of places into a box, keeping their true shape.
 *
 * Longitude shrinks towards the poles, so a degree of lng is scaled by
 * cos(latitude) — without it a route across Vienna is drawn half again too
 * wide. One scale for both axes (the smaller), centred: a day in one street
 * and a day across a region both fill the card, neither is stretched.
 */
export function fitProjection(points: readonly LatLng[], width: number, height: number, pad: number): Projection | null {
  const ps = points.filter(isLatLng);
  if (!ps.length || !(width > 0) || !(height > 0)) return null;
  const midLat = ps.reduce((a, p) => a + p.lat, 0) / ps.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  /*
    A day across the antimeridian (Fiji, the Aleutians) spans 359° if read
    naively and draws as two dots at the card's edges. When the points spread
    wider than half the world, the western ones are read one turn east.
  */
  const lngs = ps.map((p) => p.lng);
  const wrap = Math.max(...lngs) - Math.min(...lngs) > 180;
  const lngOf = (l: number) => (wrap && l < 0 ? l + 360 : l);
  const xs = ps.map((p) => lngOf(p.lng) * k), ys = ps.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const s = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  // Centred on the real middle — not on `span`, whose 1e-6 floor for a single place (or a day along one street) put the pin off-centre.
  const ox = width / 2 - ((minX + maxX) / 2) * s, oy = height / 2 - ((minY + maxY) / 2) * s;
  return { x: (p) => lngOf(p.lng) * k * s + ox, y: (p) => -p.lat * s + oy };
}

/** An SVG path through points, rounded to a tenth of a point (shorter strings, identical picture). */
export function svgPath(points: readonly LatLng[], proj: Projection): string {
  let d = '';
  points.forEach((p, i) => { d += `${i ? 'L' : 'M'}${proj.x(p).toFixed(1)},${proj.y(p).toFixed(1)}`; });
  return d;
}

/** The line split at the driver: the part already driven (to the last done stop) and the rest. */
export function splitLine(line: readonly LatLng[], lastDone: LatLng | null): { driven: LatLng[]; ahead: LatLng[] } {
  if (!lastDone || line.length < 2) return { driven: [], ahead: [...line] };
  let best = 0, bestD = Infinity;
  line.forEach((p, i) => { const d = (p.lat - lastDone.lat) ** 2 + (p.lng - lastDone.lng) ** 2; if (d < bestD) { bestD = d; best = i; } });
  return { driven: line.slice(0, best + 1), ahead: line.slice(best) };
}

/** The last recorded arrival among these stops — "back at" is only ever a time that happened. */
export function lastArrival(stops: readonly DayStop[]): Date | null {
  const t = stops.map((s) => (s.arrivedAt ? Date.parse(s.arrivedAt) : NaN)).filter(Number.isFinite);
  return t.length ? new Date(Math.max(...t)) : null;
}

/**
 * A smooth curve through points (Catmull-Rom as cubic Béziers) — the order of
 * the stops drawn as a line that reads like a route, not a zig-zag.
 */
export function smoothPath(pts: readonly { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0]!.x)},${f(pts[0]!.y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}
