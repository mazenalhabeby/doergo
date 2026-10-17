/**
 * A point on the map. Defined once, here, so geofence and route-nav both import
 * it without importing each other — a second identical interface would compile
 * and then quietly diverge the first time one of them gained a field.
 */
export interface LatLng {
  lat: number;
  lng: number;
}
