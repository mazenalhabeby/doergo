import { isAdmin, type ResolvedAccess } from '@hbcfield/shared';
import { scopeIdsFor } from './permission-scope';

/**
 * The caller of a task route, as task-service's ONE task gate
 * (`TaskAccessService`) reads them.
 *
 * This object used to be written out by hand on ~80 routes, and the copies had
 * drifted: "Resume work" sent no `viewAllSpaceIds`, so a supervisor granted
 * "view all tasks" by a space role could open a paused job and was refused
 * resuming it; only a handful forwarded `sharedSpaceIds`, so a guest could LIST
 * a shared space's tasks and then be refused the timeline of one. A copy is how
 * a rule becomes two rules. Every task route forwards THIS, and a new fact
 * reaches every check the day it is added here.
 *
 * Spread it AFTER the body, so a body field can never set who the caller is.
 */
export interface TaskActor {
  userId: string;
  userRole: string;
  organizationId: string;
  /** The ORG-wide resolution of canViewAllTasks. */
  canViewAllTasks?: boolean;
  /**
   * Spaces where "view all tasks" is held through a SPACE role. `undefined` =
   * an administrator or an org-wide grant (no narrowing); `[]` = granted
   * nowhere, which must match nothing.
   */
  viewAllSpaceIds?: string[];
  canAssignTasks?: boolean;
  /**
   * Cross-org spaces shared with the caller — from the token grant, never
   * client input — and ONLY on reads (see below). Empty on every write.
   */
  sharedSpaceIds: string[];
  /** The resolved grants, for decisions made on the task's real space. */
  access?: ResolvedAccess;
}

export interface TaskActorOptions {
  /**
   * This read may show a job in ANOTHER organization's shared space. Only the
   * routes a share was built for set it: the list, the job, its time and its
   * step submissions. Reports, comments, custom fields and the timeline do not
   * — a share has its own `showReports`-style switches, and widening every read
   * would hand a guest the host's service report (customer signature, prices)
   * on a share that never said so.
   */
  crossOrgRead?: boolean;
}

export function taskActor(req: { user?: any; method?: string }, opts: TaskActorOptions = {}): TaskActor {
  const user = req.user ?? {};
  /*
    ⚠️ A SHARED SPACE IS READ ACROSS ORGANIZATIONS, NOT WRITTEN.

    `sharedSpaceIds` widens the task boundary to another organization's space,
    and inside it the shared rule then honours the guest's OWN-org
    `canViewAllTasks` — a permission their organization gave them about THEIR
    work. That is the right answer for looking at a shared job and the wrong
    one for commenting on it, moving its step or deleting its photos, which no
    share level grants. Only the reads that opt in carry it, exactly as before
    this helper existed: list, detail, time, submissions.
  */
  const reading = opts.crossOrgRead === true && (req.method ?? 'GET').toUpperCase() === 'GET';
  return {
    userId: user.id,
    userRole: user.role,
    organizationId: user.organizationId,
    canViewAllTasks: user.canViewAllTasks,
    viewAllSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
    canAssignTasks: user.canAssignTasks,
    sharedSpaceIds: reading ? (user.access?.sharedSpaces ?? []).map((s: { spaceId: string }) => s.spaceId) : [],
    access: user.access,
  };
}

/**
 * The same caller for the routes whose `userId` names somebody ELSE (adding or
 * removing an assignee): the caller travels as `requestUserId`, so spreading
 * the actor can never overwrite the person being added or removed.
 */
export function taskRequester(req: { user?: any; method?: string }): Omit<TaskActor, 'userId'> & { requestUserId: string } {
  const { userId, ...rest } = taskActor(req);
  return { ...rest, requestUserId: userId };
}

/**
 * Where this caller holds a task grant (`canAssignTasks`, `canCreateTasks`)
 * through a role: `undefined` = an administrator or an org-wide grant (no
 * narrowing), `[ids]` = only those spaces, `[]` = nowhere.
 *
 * The route guards accept a grant held in ANY space; task-service then checks
 * this list against the task's own space, which is the real decision. It was
 * written out by hand on every assign route — one rule, one place.
 */
export function grantedSpaceIds(
  req: { user?: any },
  permission: 'canAssignTasks' | 'canCreateTasks',
): string[] | undefined {
  const user = req.user ?? {};
  return scopeIdsFor(user, permission);
}

/** Spaces where the caller may ASSIGN work — see `grantedSpaceIds`. */
export const assignSpaceIds = (req: { user?: any }) => grantedSpaceIds(req, 'canAssignTasks');
