import { Injectable, Logger } from '@nestjs/common';
import {
  RouteOptimizeRequest,
  OptimizedRoute,
  RouteLeg,
  RouteStop,
  nearestNeighbourOrder,
  haversineDistance,
} from '@hbcfield/shared';

// OSRM Trip service (Traveling-Salesman solver). Configurable so a self-hosted
// OSRM can be pointed to in prod; defaults to the public demo host so the feature
// works out of the box (low volume only — self-host for production traffic).
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const TIMEOUT_MS = 8000;
// Protect the optimizer (and the public OSRM host) from unbounded requests.
const MAX_STOPS = 25;
// Straight-line → driving fudge factor for the fallback ETA (roads aren't crow-flies).
const ROAD_FACTOR = 1.3;
const AVG_SPEED_MPS = 12.5; // ~45 km/h urban average, for fallback ETA only.

type LatLng = { lat: number; lng: number };

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  async optimize(req: RouteOptimizeRequest): Promise<OptimizedRoute> {
    const stops = (req.stops || []).filter(
      (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng),
    );
    if (stops.length === 0) {
      return {
        order: [],
        waypoints: [{ ...req.start }],
        legs: [],
        totalMeters: 0,
        totalSeconds: 0,
        engine: 'osrm',
      };
    }
    const capped = stops.slice(0, MAX_STOPS);
    if (stops.length > MAX_STOPS) {
      this.logger.warn(`optimize: capped ${stops.length} stops to ${MAX_STOPS}`);
    }

    try {
      return await this.optimizeWithOsrm(req, capped);
    } catch (err: any) {
      this.logger.warn(`OSRM /trip failed (${err?.message}); using nearest-neighbour fallback`);
      return this.optimizeFallback(req, capped);
    }
  }

  // ── OSRM Trip ──────────────────────────────────────────────────────────────
  private async optimizeWithOsrm(
    req: RouteOptimizeRequest,
    stops: RouteStop[],
  ): Promise<OptimizedRoute> {
    const hasEnd = !!req.end;
    // Waypoint order sent to OSRM: start, stops…, [end]. Indices 1..N are stops.
    const points: LatLng[] = [req.start, ...stops];
    if (hasEnd) points.push(req.end!);

    const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const params = new URLSearchParams({
      source: 'first', // trip always begins at the rep's start
      roundtrip: hasEnd ? 'false' : req.roundTrip ? 'true' : 'false',
      overview: 'full',
      geometries: 'geojson',
      annotations: 'false',
    });
    if (hasEnd) params.set('destination', 'last');

    const url = `${OSRM_URL}/trip/v1/driving/${coordStr}?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data: any = await res.json();
    if (data?.code !== 'Ok' || !Array.isArray(data.trips) || !data.trips[0]) {
      throw new Error(`OSRM code ${data?.code}`);
    }

    const trip = data.trips[0];
    // waypoints[i].waypoint_index = position of input point i in the optimized trip.
    const wps: any[] = data.waypoints || [];
    const positionOf = (inputIdx: number): number =>
      typeof wps[inputIdx]?.waypoint_index === 'number' ? wps[inputIdx].waypoint_index : inputIdx;

    // Order the STOPS (input indices 1..N) by their trip position.
    const stopEntries = stops.map((s, i) => ({ stop: s, inputIdx: i + 1 }));
    stopEntries.sort((a, b) => positionOf(a.inputIdx) - positionOf(b.inputIdx));
    const order = stopEntries.map((e) => e.stop.id);

    // Ordered waypoint list for the map: start → ordered stops → (end).
    const waypoints = [
      { lat: req.start.lat, lng: req.start.lng, label: req.start.label },
      ...stopEntries.map((e) => ({
        lat: e.stop.lat,
        lng: e.stop.lng,
        label: e.stop.label,
        stopId: e.stop.id,
      })),
      ...(hasEnd ? [{ lat: req.end!.lat, lng: req.end!.lng, label: req.end!.label }] : []),
    ];

    // Legs from OSRM trip (between consecutive optimized waypoints).
    const legs: RouteLeg[] = Array.isArray(trip.legs)
      ? trip.legs.map((leg: any, i: number) => ({
          fromIndex: i,
          toIndex: i + 1,
          meters: Math.round(leg.distance ?? 0),
          seconds: Math.round(leg.duration ?? 0),
        }))
      : [];

    return {
      order,
      waypoints,
      legs,
      totalMeters: Math.round(trip.distance ?? 0),
      totalSeconds: Math.round(trip.duration ?? 0),
      geometry: trip.geometry,
      engine: 'osrm',
    };
  }

  // ── Fallback: nearest-neighbour + straight-line ETA ─────────────────────────
  private optimizeFallback(req: RouteOptimizeRequest, stops: RouteStop[]): OptimizedRoute {
    const idxOrder = nearestNeighbourOrder(req.start, stops);
    const orderedStops = idxOrder.map((i) => stops[i]!);
    const order = orderedStops.map((s) => s.id);

    const seq: (LatLng & { label?: string; stopId?: string })[] = [
      { lat: req.start.lat, lng: req.start.lng, label: req.start.label },
      ...orderedStops.map((s) => ({ lat: s.lat, lng: s.lng, label: s.label, stopId: s.id })),
    ];
    if (req.end) seq.push({ lat: req.end.lat, lng: req.end.lng, label: req.end.label });
    else if (req.roundTrip) seq.push({ lat: req.start.lat, lng: req.start.lng, label: req.start.label });

    const legs: RouteLeg[] = [];
    let totalMeters = 0;
    let totalSeconds = 0;
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i]!;
      const b = seq[i + 1]!;
      const meters = Math.round(haversineDistance(a.lat, a.lng, b.lat, b.lng) * ROAD_FACTOR);
      const seconds = Math.round(meters / AVG_SPEED_MPS);
      legs.push({ fromIndex: i, toIndex: i + 1, meters, seconds });
      totalMeters += meters;
      totalSeconds += seconds;
    }

    return {
      order,
      waypoints: seq.map((p) => ({ lat: p.lat, lng: p.lng, label: p.label, stopId: p.stopId })),
      legs,
      totalMeters,
      totalSeconds,
      engine: 'nearest-neighbour',
    };
  }
}
