// ─────────────────────────────────────────────────────────────────────────────
// Who may decide on a page a member sent in
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where a proposal belongs, as far as deciding on it is concerned.
 *
 * Nothing here is taken from a client: the task-service reads the kind's real
 * workspace and the member's current assignments, and hands them to the rule.
 */
export interface ProposalPlace {
  /**
   * The workspace of the kind it would be created in.
   *
   * `undefined` — no kind chosen yet (or the chosen kind no longer exists, which
   *   leaves the reviewer exactly where "not chosen" does: they must pick one).
   * `null` — a kind that belongs to no workspace.
   * a string — that workspace.
   */
  kindSpaceId: string | null | undefined;
  /** The workspaces the member it is FOR is assigned to right now. */
  holderSpaceIds: readonly string[];
}

/**
 * May somebody who manages assets in `manageSpaceIds` review this proposal?
 *
 * `manageSpaceIds` follows the three states the rest of the codebase uses:
 * `null`/`undefined` = org-wide (everything), an array = those workspaces, an
 * EMPTY array = nowhere.
 *
 * ⚠️ WHEN A KIND IS CHOSEN, THE KIND DECIDES — and only the kind.
 * Accepting creates the record IN that kind, so it lands in that kind's
 * register; whoever runs that register is who says yes. The member being
 * assigned to my depot does not make another depot's van mine to create: two
 * managers would otherwise both see it, and the one who does not run the
 * register it lands in could put a vehicle on somebody else's books. A kind in
 * no workspace is reachable by no space grant at all, exactly as in the
 * contract flow (`kindInScope`).
 *
 * ⚠️ WHEN NO KIND IS CHOSEN, THE MEMBER IS THE ONLY FACT THERE IS.
 * A driver does not know the organization's taxonomy and is never asked to
 * guess, so most proposals arrive without one. The people who run the member's
 * workspace are the people responsible for that member — the same people the
 * routing tells — and without this rule a Space Manager could accept nothing a
 * driver sent in. The decision is still bounded: accepting requires choosing a
 * kind, and the contract flow refuses one outside the reviewer's workspaces.
 *
 * A member assigned to two workspaces is visible to both managers; the accept
 * CLAIMS the row with a conditional update, so only one of them acts.
 *
 * Refusals built on this answer 404, never 403: "that exists, you just may not
 * decide it" tells somebody what another depot is taking on.
 */
export function mayReviewProposal(
  place: ProposalPlace,
  manageSpaceIds: readonly string[] | null | undefined,
): boolean {
  if (manageSpaceIds == null) return true;
  if (manageSpaceIds.length === 0) return false;
  if (place.kindSpaceId !== undefined) {
    return !!place.kindSpaceId && manageSpaceIds.includes(place.kindSpaceId);
  }
  return place.holderSpaceIds.some((id) => manageSpaceIds.includes(id));
}

/**
 * The workspaces whose managers are responsible for deciding this proposal —
 * the kind's, or else the member's. The routing reads this so the people TOLD
 * are the people who MAY decide; one rule read two ways.
 */
export function proposalReviewSpaces(place: ProposalPlace): string[] {
  if (place.kindSpaceId !== undefined) return place.kindSpaceId ? [place.kindSpaceId] : [];
  return [...new Set(place.holderSpaceIds)];
}

/**
 * Does this proposal belong on `forSpaceId`'s own queue?
 *
 * The same rule again, asked of ONE workspace: its kind is there, or — no kind
 * chosen — the member it is for is assigned there.
 *
 * ⚠️ A NARROWING, NEVER A GRANT. It answers "is this one of THIS workspace's",
 * not "may this caller decide it" — the caller's scope is `mayReviewProposal`,
 * and a workspace tab asks both. A manager of Linz and Graz looking at Linz's
 * Assets tab used to be shown Graz's van too, in a kind that tab's picker does
 * not offer, so the one decision on the screen could not be made from it.
 *
 * A kind in no workspace belongs to no workspace's tab; only an org-wide queue
 * shows it, exactly as only an org-wide manager may decide it.
 */
export function proposalInSpace(place: ProposalPlace, forSpaceId: string): boolean {
  return proposalReviewSpaces(place).includes(forSpaceId);
}
