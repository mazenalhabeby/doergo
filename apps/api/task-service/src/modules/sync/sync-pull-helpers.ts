/** Module-level helpers of sync-pull.service.ts — moved here unchanged. */
import { TaskStatus } from '@hbcfield/shared';
import type { SyncPullRequest } from '@hbcfield/shared/microservices';

/** Closed work stays on the phone this long, so yesterday's job can still be looked up in a basement. */
const CLOSED_TASK_WINDOW_DAYS = 30;

/** Never send more ids than this in `scopeIds`; a member who sees more is not offline-scoped. */
const MAX_SCOPE_IDS = 5000;

const FINISHED = [TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED];

export type PullRequest = SyncPullRequest;

export { CLOSED_TASK_WINDOW_DAYS, MAX_SCOPE_IDS, FINISHED };
