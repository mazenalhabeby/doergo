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
export function activeAssignmentWhere(userId: string, now: Date = new Date()) {
  return {
    userId,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
  };
}
