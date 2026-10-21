/**
 * How far a job's CURRENT trip has gone.
 *
 * tracking-service owns the metres (`TaskRoute`, docs/data-ownership.md); task-service owns when a trip
 * starts (`Task.routeStartedAt`, set on En route). A job that goes En route again starts a new trip
 * WITHOUT task-service resetting tracking's row — the row names the trip it counted (`legStartedAt`),
 * and metres counted on an earlier trip are not this trip's. One rule for every reader, SQL included
 * (`TRIP_DISTANCE_SQL`).
 */
export interface TripDistanceRow {
  legStartedAt: Date | string | null;
  distanceMeters: number;
}

const instant = (d: Date | string | null | undefined): number | null =>
  d == null ? null : typeof d === 'string' ? Date.parse(d) : d.getTime();

/** Metres on the trip that started at `routeStartedAt` (0 when the row is from another trip, or missing). */
export function tripDistanceOf(row: TripDistanceRow | null | undefined, routeStartedAt: Date | string | null): number {
  if (!row) return 0;
  return instant(row.legStartedAt) === instant(routeStartedAt) ? row.distanceMeters : 0;
}

/**
 * The same rule in SQL, for a query whose job row is aliased `t` (the analytics registry):
 * the metres of `t`'s current trip, or NULL.
 */
export const TRIP_DISTANCE_SQL =
  '(SELECT r."distanceMeters" FROM "task_routes" r WHERE r."taskId" = t."id"' +
  ' AND r."legStartedAt" IS NOT DISTINCT FROM t."routeStartedAt")';
