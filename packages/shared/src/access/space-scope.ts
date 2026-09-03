/**
 * Narrowing reads to the spaces a caller was actually granted.
 *
 * The gateway's guard can only ever WIDEN. None of the attendance routes names
 * a space — they are keyed on entry ids, approval ids, or nothing at all — so a
 * space-scoped grant satisfies "granted anywhere" and the guard lets it through.
 * If nothing narrowed afterwards, a supervisor granted one site would read every
 * site in the organization. This is the narrowing.
 *
 * The three states are distinct on purpose:
 *
 *   null / undefined  org-wide grant (or an internal call) → do not narrow
 *   []                granted in NO space → must match nothing
 *   [ids]             granted here → match only these
 *
 * `[]` and `null` collapsing into one falsy check is exactly how this becomes a
 * data leak, so they are never tested with a plain truthiness check anywhere.
 */
export type SpaceScopeIds = string[] | null | undefined;

/** Kept for the attendance callers that named it first. */
export type AttendanceScope = SpaceScopeIds;

/**
 * A `where` fragment that limits rows to the caller's spaces.
 *
 * Both models that need it name the space `locationId` (TimeEntry,
 * OvertimeRequest), so the fragment is written once here rather than copied
 * per module — the copy is what drifts, and a drifted copy of THIS is a leak.
 * A model that names it differently (ShiftInstance, GeofenceExcursion use
 * `spaceId`) filters explicitly at its own query.
 */
export function scopeWhere(scope: SpaceScopeIds): { locationId?: { in: string[] } } {
  if (scope === null || scope === undefined) return {};
  // An empty list yields `IN ()`, which matches nothing — the correct answer for
  // somebody holding the permission in no space, and the opposite of what
  // dropping the filter would do.
  return { locationId: { in: scope } };
}

/**
 * A `where` fragment for a model that names its space something other than
 * `locationId` — ShiftInstance and GeofenceExcursion both use `spaceId`.
 *
 * Exists so those call sites stop writing `scope ? { spaceId: { in: scope } }
 * : {}` by hand. That is correct today only because an empty array is TRUTHY in
 * JavaScript, so `[]` produces `IN ()` and matches nothing — which is the right
 * answer, reached by accident. The day somebody "tidies" it to
 * `scope?.length ? … : {}` the filter disappears for a caller granted nothing
 * and they read every space in the organization. Declared here instead, once.
 */
export function scopeWhereOn(
  field: string,
  scope: SpaceScopeIds,
): Record<string, { in: string[] }> {
  if (scope === null || scope === undefined) return {};
  return { [field]: { in: scope } };
}

/**
 * May the caller act on a row in THIS space?
 *
 * For writes the route names a resource, not a space, so the guard cannot help:
 * only the service knows which space the entry belongs to. Called after loading
 * the row and before changing it.
 */
export function scopeAllows(scope: SpaceScopeIds, locationId: string | null | undefined): boolean {
  if (scope === null || scope === undefined) return true;
  return !!locationId && scope.includes(locationId);
}
