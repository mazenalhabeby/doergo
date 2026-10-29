/**
 * "Is this member assigned to this workspace RIGHT NOW?"
 *
 * A space assignment carries a window: it starts at `effectiveFrom` and ends at
 * `effectiveTo`, or never ends. Both bounds matter and each has been forgotten
 * once — a missing `effectiveFrom` let a future-dated assignment clock in before
 * it started, and a missing `effectiveTo` let an ended one keep working.
 *
 * It lives here because the same question is asked in two places that MUST agree:
 * the list of workspaces a member is offered to clock in at, and the check that
 * refuses the clock-in. A picker built on a looser rule offers a choice that is
 * then refused, which reads to the member as the product being broken; a picker
 * built on a stricter one hides a site they are standing in.
 */
/** `userId` may be several people at once (`{ in: [...] }`) — the window is the same rule. */
export function activeAssignmentWhere(userId: string | { in: string[] }, now: Date = new Date()) {
  return { userId, ...activeWindowWhere(now) };
}

/**
 * The window alone, for a query that names the people (or the space) itself:
 * started on or before `now` and not ended before it. Spread it into a `where`
 * — it carries an `OR`, so never beside another `OR` in the same object.
 */
export function activeWindowWhere(now: Date = new Date()) {
  return { effectiveFrom: { lte: now }, ...notEndedWhere(now) };
}

/**
 * Only the END bound: not ended before `at` (future-dated assignments included).
 * Kept apart from `activeWindowWhere` on purpose — the queries that use it ask
 * "who is or will be on this roster", and adding the start bound would change
 * what they return.
 */
export function notEndedWhere(at: Date = new Date()) {
  return { OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] };
}

/**
 * The same end bound as `notEndedWhere`, for a row already read: has this assignment ENDED before `at`? A former
 * member re-added is a member again — their row reopens (`effectiveTo` cleared) rather than staying ended while the
 * screen says "assigned".
 */
export function assignmentEnded(row: { effectiveTo?: Date | null } | null | undefined, at: Date = new Date()): boolean {
  return !!row?.effectiveTo && row.effectiveTo.getTime() < at.getTime();
}
