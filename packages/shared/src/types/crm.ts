// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE PLANNING / OPTIMIZATION (mobile field feature)
//
//  There is no CRM/sales module — sales/delivery is just a Space + normal Tasks
//  on a GPS-capable workflow. The one field-specific capability is optimizing a
//  day's visit/delivery Tasks into the shortest driving order and handing off to
//  Google Maps / Waze / Apple Maps. A "stop" is a Task with a location (or an
//  ad-hoc address). Consumed by the mobile app; the backend endpoint is
//  stateless.
// ═══════════════════════════════════════════════════════════════════════════

export interface RouteStop {
  id: string; // caller's id (taskId / free) — echoed back in order
  lat: number;
  lng: number;
  label?: string;
  address?: string;
}

export interface RouteOptimizeRequest {
  start: { lat: number; lng: number; label?: string };
  stops: RouteStop[];
  end?: { lat: number; lng: number; label?: string };
  profile?: 'driving';
  roundTrip?: boolean;
}

export interface RouteLeg {
  fromIndex: number;
  toIndex: number;
  meters: number;
  seconds: number;
}

export interface OptimizedRoute {
  order: string[];
  waypoints: { lat: number; lng: number; label?: string; stopId?: string }[];
  legs: RouteLeg[];
  totalMeters: number;
  totalSeconds: number;
  geometry?: unknown;
  /**
   * Which engine answered. 'nearest-neighbour' is the only one that returns NO
   * road geometry — it orders the stops by straight-line distance — so a client
   * showing pins with no route line between them is looking at that.
   */
  engine: 'google' | 'osrm' | 'nearest-neighbour';
}
