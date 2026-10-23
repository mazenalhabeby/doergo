/** What every sync scope shares: the window for closed work, the id cap, and which tasks a member keeps. */
import { TaskStatus } from '@hbcfield/shared';
import type { SyncPullRequest } from '@hbcfield/shared/microservices';
import { buildTaskVisibilityWhere, type TaskVisibilityFacts } from '../tasks/core/task-visibility';

/** Closed work stays on the phone this long, so yesterday's job can still be looked up in a basement. */
const CLOSED_TASK_WINDOW_DAYS = 30;

/** Never send more ids than this in `scopeIds`; a member who sees more is not offline-scoped. */
const MAX_SCOPE_IDS = 5000;

const FINISHED = [TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED];

export type PullRequest = SyncPullRequest;

/** The tasks a member keeps offline: visible to them, open or recently closed. */
function tasksInScope(req: TaskVisibilityFacts) {
  const visibility = buildTaskVisibilityWhere(req);
  const windowStart = new Date(Date.now() - CLOSED_TASK_WINDOW_DAYS * 86_400_000);
  return {
    organizationId: visibility.organizationId,
    AND: [...(visibility.AND ?? []), { OR: [{ status: { notIn: FINISHED } }, { updatedAt: { gte: windowStart } }] }],
  };
}

export { CLOSED_TASK_WINDOW_DAYS, MAX_SCOPE_IDS, FINISHED, tasksInScope };
