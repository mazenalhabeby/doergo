import {
  isTaskAssignee, getFlowSteps, getStartOfDay,
  rankMyWork, workBand, workflowStatusLabel,
  type FlowStatus,
} from '@hbcfield/shared/client';
import type { ScheduleEntry, Task } from '@/lib/api/types';
import { tasksOn } from './work-shape';
export {
  tasksOn,
  shapeFor,
  faceFor,
  viewAllSpaceIds,
  startOfDay,
  weekOf,
  sameDay,
  nextDayStart,
  msUntilNextDay,
  hasHour,
  isMine,
  flowIdOf,
  stepsFor,
  isClosed,
  isCanceled,
  isUnderWay,
  withoutCanceled,
  stepLabelFor,
  shiftOn,
  type DayHoursChange,
  shiftHours,
  nextJobAfter,
  figuresFor,
} from './work-shape';

/**
 * My work — the pure half. `docs/design/my-work/`.
 *
 * ⚠️ TWO AXES, RESOLVED SEPARATELY. They do not interact — resolve the shape,
 * then fill it. That is the only reason twelve combinations are tractable.
 *
 *   WHICH MODULES YOU HOLD  →  the SHAPE   (bars, dots, or both)
 *   WHICH JOBS YOU CAN SEE  →  the CONTENT (yours, the site's, the org's)
 *
 * ⚠️ NOTHING HERE CALLS THE SERVER. Every fact comes from rows the phone
 * already holds: `useHomeTasks()`, the member's own weekly schedule, and the
 * workflows the offline engine keeps.
 */
/**
 * Today's own work: what is due today, PLUS what is already in your hands
 * whatever its date says — under way, blocked, or overdue.
 *
 * ⚠️ A JOB YOU ARE ON DOES NOT LEAVE BECAUSE ITS DATE PASSED. "On the way" to
 * a visit due sixteen days ago dropped out of Today entirely (01.png), while
 * the Jobs tab put it first as "Next up". Both now order by `rankMyWork` — the
 * shared answer to "what do I do next" — so they cannot disagree.
 */
export function todaysOwn(
  mine: Task[], today: Date, isOpen: (t: Task) => boolean, now: Date = new Date(),
  /** A custom workflow's "under way" (`isUnderWay`); the built-in steps need nothing. */
  underWay: (t: Task) => boolean = () => false,
): Task[] {
  const band = (t: Task) => (underWay(t) && t.status !== 'BLOCKED' ? 'doing' : workBand(t as never, now));
  const due = new Set(tasksOn(mine, today).map((t) => t.id));
  const carried = mine.filter((t) => {
    if (due.has(t.id) || !isOpen(t)) return false;
    const b = band(t);
    return b === 'doing' || b === 'blocked' || b === 'overdue';
  });
  /*
    ⚠️ CARRIED WORK FIRST, BY THE SHARED RANKING; THEN TODAY BY THE CLOCK. A
    day read by priority went 12:00, 10:00, 11:00, 14:00 — a list of a day is
    read top to bottom as the day goes.
  */
  // The shared ranking, then a stable pass so a custom step under way sorts with the built-in ones.
  const ORDER: Record<string, number> = { doing: 0, blocked: 1, overdue: 2, today: 3, upcoming: 4 };
  const byBand = (list: Task[]) => list.map((t, i) => ({ t, i })).sort((a, b) => (ORDER[band(a.t)] - ORDER[band(b.t)]) || a.i - b.i).map((x) => x.t);
  const first = byBand(rankMyWork(carried as never[], now) as unknown as Task[]);
  const today_ = tasksOn(mine, today).filter((t) => !first.includes(t));
  const ranked = rankMyWork(today_ as never[], now) as unknown as Task[];
  const active = ranked.filter((t) => ['doing', 'blocked'].includes(band(t)));
  return [...first, ...active, ...today_.filter((t) => !active.includes(t))];
}
