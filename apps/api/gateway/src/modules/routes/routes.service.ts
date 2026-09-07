import { Injectable, Logger } from '@nestjs/common';
import {
  RouteOptimizeRequest,
  OptimizedRoute,
  RouteLeg,
  RouteStop,
  nearestNeighbourOrder,
  decodePolyline,
  haversineDistance,
} from '@hbcfield/shared';

/*
  OSRM Trip service (the Traveling-Salesman solver behind route optimization).

  OPT-IN. It used to default to `router.project-osrm.org` — a public demo host
  whose own usage policy says it is not for production, run by people this
  business has no agreement with, and sent every customer address on the route.
  Free until it is blocked, and blocked takes the feature out for everyone at
  once.

  Unset now means "no routing engine", and the optimizer uses its
  nearest-neighbour ordering instead — which it already did whenever OSRM was
  slow or down, so this is a path that gets exercised rather than a new one.
  Point OSRM_URL at your own instance, or a provider you have a contract with,
  to get true road distances back.
*/
const OSRM_URL = process.env.OSRM_URL?.trim() || null;

/*
  Google's Routes API — the same key the /geo proxy already uses.

  It answers the two questions this screen actually asks, in one call: the best
  visit order, and the road path between the stops. Nothing on the phone can do
  either. `react-native-maps` shows Apple Maps on iOS and Google Maps on
  Android, but a map SDK draws a Polyline from coordinates you give it; neither
  platform hands out routing to a third-party app, so the route has to be
  computed somewhere and then drawn. Doing it server-side means one
  implementation for both platforms and the key never leaves the server.

  ⚠️ BILLED PER REQUEST, and waypoint optimization is charged at Google's
  higher "Advanced" tier. That is why it runs when somebody presses Optimize
  and never on a screen opening.
*/
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY?.trim() || '';
const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
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
        // Nothing was routed, so report the engine that WOULD have run. Saying
        // 'osrm' with no OSRM configured is a small lie the caller can act on.
        engine: OSRM_URL ? 'osrm' : 'nearest-neighbour',
      };
    }
    const capped = stops.slice(0, MAX_STOPS);
    if (stops.length > MAX_STOPS) {
      this.logger.warn(`optimize: capped ${stops.length} stops to ${MAX_STOPS}`);
    }

    /*
      Engines in order of what they can answer, each falling through to the
      next. Only the first two return road geometry; the last returns an order
      and straight-line estimates, which is why a map showing pins and no route
      line means no engine was configured.
    */
    if (GOOGLE_KEY) {
      try {
        return await this.optimizeWithGoogle(req, capped);
      } catch (err: any) {
        this.logger.warn(`Google Routes failed (${err?.message}); trying the next engine`);
      }
    }

    // No engine configured: go straight to the ordering we would have fallen
    // back to anyway, rather than spending an 8-second timeout proving it.
    if (!OSRM_URL) return this.optimizeFallback(req, capped);

    try {
      return await this.optimizeWithOsrm(req, capped);
    } catch (err: any) {
      this.logger.warn(`OSRM /trip failed (${err?.message}); using nearest-neighbour fallback`);
      return this.optimizeFallback(req, capped);
    }
  }

  // ── Google Routes (computeRoutes) ──────────────────────────────────────────
  private async optimizeWithGoogle(
    req: RouteOptimizeRequest,
    stops: RouteStop[],
  ): Promise<OptimizedRoute> {
    const pt = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const hasEnd = !!req.end;
    // Somewhere to finish: an explicit end, back to the start for a round trip,
    // or the last stop — which Google needs named as the destination rather
    // than left as an intermediate.
    const destination = hasEnd ? req.end! : req.roundTrip ? req.start : stops[stops.length - 1]!;
    const intermediates = hasEnd || req.roundTrip ? stops : stops.slice(0, -1);

    const res = await fetch(GOOGLE_ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        // Google bills by how much is asked for, so ask for exactly what is
        // drawn: the order, the road shape, and per-leg distance and time.
        'X-Goog-FieldMask': [
          'routes.optimizedIntermediateWaypointIndex',
          'routes.polyline.encodedPolyline',
          'routes.legs.distanceMeters',
          'routes.legs.duration',
          'routes.distanceMeters',
          'routes.duration',
        ].join(','),
      },
      body: JSON.stringify({
        origin: pt(req.start),
        destination: pt(destination),
        intermediates: intermediates.map(pt),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        // The travelling-salesman part. Without it Google drives the stops in
        // the order they were listed, which is not a plan.
        optimizeWaypointOrder: intermediates.length > 1,
        polylineQuality: 'HIGH_QUALITY',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Google Routes HTTP ${res.status}`);
    const data: any = await res.json();
    const route = data?.routes?.[0];
    if (!route) throw new Error('Google Routes returned no route');

    /*
      Reorder our stops the way Google decided to drive them.

      `optimizedIntermediateWaypointIndex[i]` is the index INTO the
      intermediates we sent of the stop visited i-th. Absent when there was
      nothing to optimize, in which case the order we sent stands.
    */
    const optIdx: number[] | undefined = route.optimizedIntermediateWaypointIndex;
    const orderedIntermediates = Array.isArray(optIdx) && optIdx.length === intermediates.length
      ? optIdx.map((i) => intermediates[i]!)
      : intermediates;
    const orderedStops = hasEnd || req.roundTrip
      ? orderedIntermediates
      : [...orderedIntermediates, stops[stops.length - 1]!];

    const seq: (LatLng & { label?: string; stopId?: string })[] = [
      { lat: req.start.lat, lng: req.start.lng, label: req.start.label },
      ...orderedStops.map((s) => ({ lat: s.lat, lng: s.lng, label: s.label, stopId: s.id })),
    ];
    if (hasEnd) seq.push({ lat: req.end!.lat, lng: req.end!.lng, label: req.end!.label });
    else if (req.roundTrip) seq.push({ lat: req.start.lat, lng: req.start.lng, label: req.start.label });

    // Google reports durations as a string of seconds ("1234s").
    const secs = (v: unknown) => Math.round(parseFloat(String(v ?? '0').replace('s', '')) || 0);
    const legs: RouteLeg[] = (route.legs ?? []).map((l: any, i: number) => ({
      fromIndex: i,
      toIndex: i + 1,
      meters: Math.round(l?.distanceMeters ?? 0),
      seconds: secs(l?.duration),
    }));

    return {
      order: orderedStops.map((s) => s.id),
      waypoints: seq.map((p) => ({ lat: p.lat, lng: p.lng, label: p.label, stopId: p.stopId })),
      legs,
      totalMeters: Math.round(route.distanceMeters ?? 0),
      totalSeconds: secs(route.duration),
      // The road shape, in the GeoJSON order the rest of this codebase passes
      // around — decoded in shared so client and server cannot disagree.
      geometry: {
        type: 'LineString',
        coordinates: decodePolyline(route.polyline?.encodedPolyline ?? ''),
      },
      engine: 'google',
    };
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
