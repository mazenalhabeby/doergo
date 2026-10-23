import { NotFoundException } from '@nestjs/common';
import { scopeAllows, type SpaceScopeIds } from '@hbcfield/shared';

/*
  Workspace reach for portal reads and writes, as pure rules (no database).

  `scopeSpaceIds` is the list of workspaces in which the caller holds the
  portal key the route asks for (undefined/null = org-wide, [] = nowhere).
  Every refusal is the same 404 a missing record gets, so a workspace-scoped
  manager learns nothing about the workspaces beside theirs.
*/

/**
 * Narrow a unit lookup to the spaces the caller holds.
 *
 * A unit has no space column of its own — it reaches one through its client
 * (`Customer.spaceId`) or through its portal (`Portal.spaceId`). Either link
 * is enough, so the filter is an OR across both.
 *
 * undefined = org-wide (adds nothing). `[]` = granted nowhere and matches
 * nothing — written out rather than left to a truthiness check, because
 * collapsing it into "org-wide" is the failure this whole scoping exists to
 * prevent. A unit attached to neither a client nor a portal is unreachable
 * for a scoped caller, which is the safe answer: nothing ties it to a site
 * they run.
 */
export function unitScope(scopeSpaceIds?: SpaceScopeIds): Record<string, unknown> {
  if (scopeSpaceIds === undefined || scopeSpaceIds === null) return {};
  return {
    OR: [
      // The unit's own workspace — the catalog a workspace's Units tab lists
      // (`listSpaceUnits` reads exactly this column). Without it a unit filed
      // in the workspace but not yet given a client or a portal was out of
      // reach of the very people who run that workspace.
      { spaceId: { in: scopeSpaceIds } },
      { customer: { spaceId: { in: scopeSpaceIds } } },
      { portal: { spaceId: { in: scopeSpaceIds } } },
    ],
  };
}

/** A workspace a write names (a target, not the record's own) must be in reach. */
export function assertSpaceRefInScope(scope: SpaceScopeIds, spaceId: string | null | undefined) {
  if (spaceId === undefined) return;
  // null = "organization level": reachable with the org-wide key only.
  if (!scopeAllows(scope, spaceId)) throw new NotFoundException('Space not found');
}

/** A category is in reach through its PORTAL's workspace (not its routing space). */
export function categoryScope(scope: SpaceScopeIds): Record<string, unknown> {
  if (scope === undefined || scope === null) return {};
  return { portal: { spaceId: { in: scope } } };
}
