import { Injectable, Logger } from '@nestjs/common';

/**
 * Snapping a raw GPS trace onto the road network.
 *
 * This used to run in the browser: every viewer of a task fetched
 * `router.project-osrm.org` directly, putting up to a hundred of an employee's
 * coordinates and their timestamps in a URL to a public demo server — one the
 * business has no agreement with, whose access logs it does not control, and
 * whose own usage policy says it is not for production. Every person who opened
 * the task did it again.
 *
 * It runs here instead, and only when an operator opts in by pointing
 * OSRM_URL at a service they trust — their own instance, or a provider they
 * have a contract with. Unset (the default) means no coordinates leave this
 * network at all and the map simply draws the raw GPS trace, which is exactly
 * what the client already falls back to.
 */
@Injectable()
export class RouteMatchingService {
  private readonly logger = new Logger(RouteMatchingService.name);

  /** Points sent upstream. OSRM's match service degrades well past ~100. */
  private static readonly MAX_POINTS = 100;
  /** Never let a slow upstream hold the route response open. */
  private static readonly TIMEOUT_MS = 4000;

  private get endpoint(): string | null {
    return process.env.OSRM_URL?.trim() || null;
  }

  /**
   * Road-snapped path as [lat, lng] pairs, or null when matching is off,
   * upstream fails, or there is too little to match. Null is not an error — the
   * caller draws the raw points, which is a truthful picture of what the device
   * actually recorded.
   */
  async matchToRoads(
    points: { lat: number; lng: number; timestamp: Date }[],
  ): Promise<[number, number][] | null> {
    const base = this.endpoint;
    if (!base || points.length < 2) return null;

    // Evenly thin to the cap, always keeping the final point so the path ends
    // where the member actually stopped.
    const sampled = this.sample(points);
    const coords = sampled.map((p) => `${p.lng},${p.lat}`).join(';');
    const timestamps = sampled
      .map((p) => Math.floor(p.timestamp.getTime() / 1000))
      .join(';');

    const url = `${base.replace(/\/$/, '')}/match/v1/driving/${coords}?overview=full&geometries=geojson&timestamps=${timestamps}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RouteMatchingService.TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal }).finally(() =>
        clearTimeout(timer),
      );
      if (!res.ok) return null;

      const data = (await res.json()) as {
        code?: string;
        matchings?: { geometry?: { coordinates?: [number, number][] } }[];
      };
      const line = data.code === 'Ok' ? data.matchings?.[0]?.geometry?.coordinates : undefined;
      if (!line?.length) return null;

      // OSRM answers [lng, lat]; the map wants [lat, lng].
      return line.map(([lng, lat]) => [lat, lng] as [number, number]);
    } catch (err) {
      // Never fail a route read because the matcher is unavailable.
      this.logger.warn(`Road matching unavailable: ${err}`);
      return null;
    }
  }

  private sample<T>(points: T[]): T[] {
    const max = RouteMatchingService.MAX_POINTS;
    if (points.length <= max) return points;
    const step = Math.ceil(points.length / max);
    const out = points.filter((_, i) => i % step === 0);
    const last = points[points.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }
}
