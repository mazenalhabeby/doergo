/**
 * Geofence Utilities
 *
 * Functions for calculating distances and validating geofence boundaries
 * for the attendance tracking feature.
 */

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param lat1 - Latitude of first point
 * @param lng1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lng2 - Longitude of second point
 * @returns Distance in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a point is within a geofence radius of a location
 * @param pointLat - Latitude of point to check
 * @param pointLng - Longitude of point to check
 * @param locationLat - Latitude of geofence center
 * @param locationLng - Longitude of geofence center
 * @param radiusMeters - Radius of geofence in meters
 * @returns true if point is within geofence
 */
export function isWithinGeofence(
  pointLat: number,
  pointLng: number,
  locationLat: number,
  locationLng: number,
  radiusMeters: number,
): boolean {
  const distance = haversineDistance(pointLat, pointLng, locationLat, locationLng);
  return distance <= radiusMeters;
}

/**
 * Get the distance from a point to a geofence boundary
 * Returns negative if inside geofence, positive if outside
 * @param pointLat - Latitude of point
 * @param pointLng - Longitude of point
 * @param locationLat - Latitude of geofence center
 * @param locationLng - Longitude of geofence center
 * @param radiusMeters - Radius of geofence in meters
 * @returns Distance to boundary in meters (negative = inside, positive = outside)
 */
export function distanceToGeofenceBoundary(
  pointLat: number,
  pointLng: number,
  locationLat: number,
  locationLng: number,
  radiusMeters: number,
): number {
  const distance = haversineDistance(pointLat, pointLng, locationLat, locationLng);
  return distance - radiusMeters;
}
