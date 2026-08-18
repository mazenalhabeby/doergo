/**
 * May this caller touch this task?
 *
 * ONE rule, because there were two and they disagreed. tasks.service and
 * attachments.service each carried their own copy: one honoured co-assignees
 * and forgot the organization boundary on two paths, the other guarded the
 * boundary but only recognised the lead assignee — so a member co-assigned to a
 * task could comment on it but not attach a photo to it, and a stale assignment
 * from an org transfer kept write access to another tenant's task.
 *
 * Pure and dependency-free so both services share it and it can be tested on
 * its own. Callers supply the facts; this decides.
 */

/** What the rule needs to know about the task. */
export interface TaskAccessSubject {
  organizationId: string;
  /** Space the task lives in — the anchor for a cross-org share. */
  spaceId?: string | null;
  /** Lead assignee (legacy single-assignee field). */
  assignedToId?: string | null;
  /**
   * Co-assignees, when they were loaded with the task. `undefined` means "not
   * loaded" — ask `needsAssigneeLookup` and re-check with `isAssignee`.
   */
  assignees?: Array<{ userId: string }> | null;
}

/** What it needs to know about the caller. */
export interface TaskAccessCaller {
  userId: string;
  /** Role string; ADMIN reaches any task inside the boundary. */
  userRole?: string;
  organizationId: string;
  /** "View all tasks" grant — same reach as ADMIN, inside the boundary. */
  canViewAllTasks?: boolean;
  /**
   * Spaces another organization has shared with this caller's org. The ONLY
   * legitimate way across the boundary, and server-authoritative — resolved
   * from the token grant, never client input. Omit for same-org semantics.
   */
  sharedSpaceIds?: string[];
}

const ADMIN_ROLE = 'ADMIN';

/**
 * Is the task inside the caller's boundary at all?
 *
 * Checked FIRST, before any relationship to the task is considered. A
 * relationship grants access within the boundary; it never crosses it.
 */
export function isWithinTaskBoundary(task: TaskAccessSubject, caller: TaskAccessCaller): boolean {
  if (task.organizationId === caller.organizationId) return true;
  return (
    !!task.spaceId &&
    Array.isArray(caller.sharedSpaceIds) &&
    caller.sharedSpaceIds.includes(task.spaceId)
  );
}

/**
 * Is the caller on this task — as lead or co-assignee?
 *
 * Returns `null` when the co-assignee rows were not loaded, meaning the answer
 * is unknown and needs a lookup. Never guesses.
 */
export function isTaskAssignee(task: TaskAccessSubject, userId: string): boolean | null {
  if (task.assignedToId && task.assignedToId === userId) return true;
  if (task.assignees === undefined) return null;
  if (task.assignees === null) return false;
  return task.assignees.some((a) => a.userId === userId);
}

/**
 * The decision.
 *
 * `assigneeOverride` supplies the answer when the rows were not loaded and the
 * caller looked it up — see `isTaskAssignee` returning null.
 */
export function canAccessTask(
  task: TaskAccessSubject,
  caller: TaskAccessCaller,
  assigneeOverride?: boolean,
): boolean {
  if (!isWithinTaskBoundary(task, caller)) return false;

  const assignee = assigneeOverride ?? isTaskAssignee(task, caller.userId);
  if (assignee === true) return true;

  return caller.userRole === ADMIN_ROLE || caller.canViewAllTasks === true;
}
