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
export type { LatLng } from './geo-point';

export {
  type SiteZone,
  type AtSiteResult,
  haversineDistance,
  isPointInPolygon,
  distanceToPolygonEdge,
  isAtSite,
  geofenceArmRadius,
  siteEnforcesZone,
} from './geofence/site';
export {
  GEOFENCE_POLYGON_LIMITS,
  type GeofencePolygonError,
  polygonAreaSqm,
  validateGeofencePolygon,
  parseGeofencePolygon,
  RADIUS_SLIDER_STEPS,
  radiusToSliderPosition,
  sliderPositionToRadius,
} from './geofence/polygon';
