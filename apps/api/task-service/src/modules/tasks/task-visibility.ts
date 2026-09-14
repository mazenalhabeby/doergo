import { Role } from '@hbcfield/shared';

export interface TaskVisibilityFacts {
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  /** Spaces where the caller holds canViewAllTasks by a SPACE role. */
  viewAllSpaceIds?: string[];
  organizationId: string;
}

/**
 * Who may see which tasks — the single definition.
 *
 * Used by the task list, the status counts and the offline pull. The list and
 * the counts once had their own copies and disagreed: the counts filtered an
 * ADMIN down to tasks they CREATED while the list showed the whole org, and
 * matched a member on `assignedToId` alone while the list also matched
 * co-assignees. A phone's offline copy must be the same set the list shows.
 */
export function buildTaskVisibilityWhere(opts: TaskVisibilityFacts): { organizationId: string; AND?: any[] } {
  const { userId, userRole, canViewAllTasks, organizationId, viewAllSpaceIds } = opts;
  if (userRole === Role.ADMIN || canViewAllTasks) {
    return { organizationId };
  }
  /*
    "View all tasks" held in a SPACE means all tasks IN THAT SPACE.

    The flag above is the org-wide answer, so a member whose grant comes from
    a space role fell straight through to "only what is assigned to me" — they
    could create a task in their workspace and then not see it. This ADDS the
    spaces they may see in full; it does not replace the assignment clause.
  */
  if (viewAllSpaceIds?.length) {
    /*
      Returned as AND-of-OR, not a bare `OR`.

      Callers copy only `organizationId` and `AND` off this result. A bare `OR`
      was therefore DROPPED and the caller was left with `{ organizationId }` —
      every task in the organization, to somebody entitled to one space.
    */
    return {
      organizationId,
      AND: [
        {
          OR: [
            { spaceId: { in: viewAllSpaceIds } },
            { assignedToId: userId },
            { assignees: { some: { userId } } },
          ],
        },
      ],
    };
  }
  // Assigned to them as LEAD (legacy assignedToId) OR as a co-assignee.
  return {
    organizationId,
    AND: [{ OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }] }],
  };
}
