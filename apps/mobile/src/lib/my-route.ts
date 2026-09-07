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
 * open job, assigned to me, that has somewhere to be AND is the kind of job
 * somebody travels to. A field worker gets the banner; a supervisor does not;
 * an admin who is genuinely assigned a visit gets it, and gets their own stops;
 * somebody whose jobs are all desk work does not, however many addresses those
 * jobs happen to carry.
 */
const FINISHED: string[] = [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.CLOSED];

export function isMyRouteStop(task: Task, userId?: string | null): boolean {
  if (!userId || task.assignedToId !== userId) return false;
  if (FINISHED.includes(task.status as string)) return false;
  if (task.locationLat == null || task.locationLng == null) return false;

  /*
    A pin is not a journey.

    Coordinates alone were the test, and they are not enough: a task can carry
    a perfectly good address and sit on a flow with no travel step in it — a
    support ticket with the customer's address on it — so a route built from
    pins silently included stops nobody drives to, and offered the banner to
    someone whose whole list is desk work.

    `tracksLocation` comes from the server, which reads the task's actual
    workflow. ⚠️ ABSENT MEANS YES, deliberately: this app updates over the air
    and may be talking to a gateway that predates the field, and treating a
    missing answer as "no" would take the button away from every field worker
    at once, everywhere, with nothing to explain it. Absent falls back to the
    old rule; present is believed.
  */
  const tracks = (task as { tracksLocation?: boolean }).tracksLocation;
  return tracks !== false;
}

/** Is there anything to plan? Drives whether the banner is offered at all. */
export function hasRouteToPlan(tasks: Task[], userId?: string | null): boolean {
  return tasks.some((t) => isMyRouteStop(t, userId));
}
