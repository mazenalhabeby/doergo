/**
 * Did an update move the site itself — its pin, its radius or its drawn area?
 * BOUNDARY_CHANGED on an offline clock-in compares the tap with the moment this
 * last happened (`CompanyLocation.boundaryChangedAt`), so renaming a workspace or
 * changing its time zone no longer marks every offline clock-in for review.
 */
export function siteBoundaryChanged(
  existing: { lat: number | null; lng: number | null; geofenceRadius: number; geofencePolygon: unknown },
  data: { lat?: number | null; lng?: number | null; geofenceRadius?: number },
  polygonWrite: unknown,
): boolean {
  if (data.lat !== undefined && data.lat !== existing.lat) return true;
  if (data.lng !== undefined && data.lng !== existing.lng) return true;
  if (data.geofenceRadius !== undefined && data.geofenceRadius !== existing.geofenceRadius) return true;
  if (polygonWrite === undefined) return false;
  const next = Array.isArray(polygonWrite) ? polygonWrite : null;
  const before = Array.isArray(existing.geofencePolygon) ? existing.geofencePolygon : null;
  return JSON.stringify(next) !== JSON.stringify(before);
}
