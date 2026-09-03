// TaskStatus from the shared package rather than the api barrel: the barrel
// pulls the fetch client and with it React Native, which would make this rule
// untestable outside a device for no reason. The type import is erased.
import { TaskStatus } from '@hbcfield/shared/client';
import type { Task } from './api';

/**
 * Which of these jobs would I actually drive to?
 *
 * "Plan my route" is for the person who executes the work: it takes the jobs on
 * your list, orders them by distance and hands them to a navigation app. Two
 * places asked that question badly.
 *
 * The banner on the Tasks screen was unconditional, so it was offered to
 * somebody who supervises a site and drives nowhere — and the planner behind it
 * read the whole task list, which for anyone who oversees work is EVERYBODY's
 * jobs. Pressing it would have proposed a driving route around fifty-four jobs
 * belonging to eight other people.
 *
 * The rule is not a role. It asks whether there is a route to plan at all: an
 * open job, assigned to me, that has somewhere to be. A field worker gets the
 * banner; a supervisor does not; an admin who is genuinely assigned a job gets
 * it, and gets their own stops.
 */
const FINISHED: string[] = [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.CLOSED];

export function isMyRouteStop(task: Task, userId?: string | null): boolean {
  if (!userId || task.assignedToId !== userId) return false;
  if (FINISHED.includes(task.status as string)) return false;
  return task.locationLat != null && task.locationLng != null;
}

/** Is there anything to plan? Drives whether the banner is offered at all. */
export function hasRouteToPlan(tasks: Task[], userId?: string | null): boolean {
  return tasks.some((t) => isMyRouteStop(t, userId));
}
