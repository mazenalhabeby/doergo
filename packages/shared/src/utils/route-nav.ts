// ═══════════════════════════════════════════════════════════════════════════
//  Route navigation helpers (pure, runtime-agnostic — web + mobile + server)
//
//  Two jobs:
//   1) Hand an OPTIMIZED, ordered set of stops to a navigation app. Google Maps
//      supports a true multi-stop deep link that carries our optimized order;
//      Waze and Apple Maps are single-destination, so those get a stop-by-stop
//      "navigate to next stop" pattern.
//   2) A dependency-free nearest-neighbour fallback ordering, used server-side
//      when the OSRM /trip engine is unavailable.
// ═══════════════════════════════════════════════════════════════════════════
export type { LatLng } from './geo-point';

export {
  type NavApp,
  type NavStop,
  buildGoogleMapsUrl,
  buildWazeUrl,
  buildAppleMapsUrl,
  buildNavUrl,
  supportsMultiStop,
} from './route-nav/links';
export {
  nearestNeighbourOrder,
  decodePolyline,
  NAV_APP_PROBES,
  NAV_APP_LABELS,
  navAppCandidates,
  isAlwaysAvailable,
  AT_STOP_RADIUS_METRES,
  stopsAheadOf,
  STRAIGHT_LINE_ROAD_FACTOR,
  STRAIGHT_LINE_SPEED_MPS,
  straightLineRoute,
} from './route-nav/routing';
