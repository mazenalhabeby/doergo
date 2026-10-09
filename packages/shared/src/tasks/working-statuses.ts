import { TaskStatus } from '../types/enums';

/**
 * A job somebody is WORKING ON right now: on the way, on site, working, or
 * stopped mid-job. Narrower than `ACTIVE_STATUSES` (constants/task.ts), which
 * means "not finished" and includes NEW and ASSIGNED.
 *
 * Two copies in the workspace presence panel were called `ACTIVE_STATUSES` —
 * the same name as the shared constant with a different meaning, which is
 * how somebody "fixes" one into the other. Ordered most-engaged first; the
 * panel shows a member's most engaged job.
 */
export const WORKING_NOW_STATUSES: readonly TaskStatus[] = [
  TaskStatus.IN_PROGRESS,
  TaskStatus.ARRIVED,
  TaskStatus.EN_ROUTE,
  TaskStatus.BLOCKED,
];
