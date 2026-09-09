import { isFinishedStatus } from '../constants/task';
/**
 * What should I work on next?
 *
 * A list of tasks assigned to somebody is not an answer to that question — it is
 * the raw material for it. Sorted by creation date, the job that is two days
 * overdue sits below one due next month, and the job already half-done sits
 * wherever it happens to fall.
 *
 * So this orders by what a person actually does next, and it is pure and shared
 * so the phone and the web cannot disagree about it.
 *
 * The order, and why each step is above the one below it:
 *
 *   1. ALREADY UNDER WAY — you are standing in somebody's kitchen. Finishing
 *      beats starting, and nothing else on the list is more urgent than the
 *      thing you are in the middle of.
 *   2. BLOCKED — under way, but stopped. Above everything not started, because
 *      it is a promise already made that somebody is waiting on, and unblocking
 *      is usually somebody else's minute.
 *   3. OVERDUE — the promise is already broken; every hour makes it worse.
 *   4. DUE TODAY — the promise is still keepable.
 *   5. EVERYTHING ELSE, soonest first.
 *
 * Within any band, urgency decides, then the due date, then the title so the
 * order is stable and does not shuffle between refreshes.
 */

/** Only what the ordering reads. Anything task-shaped satisfies it. */
export interface WorkItem {
  id: string;
  title?: string | null;
  status: string;
  priority?: string | null;
  dueDate?: string | Date | null;
}

export type WorkBand = 'doing' | 'blocked' | 'overdue' | 'today' | 'upcoming';

/** Statuses that mean "this is in my hands right now". */
const UNDER_WAY = new Set(['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WORKING']);
/**
 * Is this task over, whatever its date says?
 *
 * `isFinishedStatus` in ../constants/task is the product's answer and is reused
 * rather than restated — a second list of finished statuses is a second thing to
 * update the day a status is added, and the two would then disagree about
 * whether to sink a task to the bottom of somebody's day.
 *
 * The one addition is DONE, which the canonical enum has no name for but a
 * custom workflow commonly does; it is checked here rather than pushed into the
 * canonical rule, which is about the canonical enum.
 */
function isOver(status: string): boolean {
  return isFinishedStatus(status) || status === 'DONE';
}

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** The local calendar day of an instant, as the rota means it. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Which band a task falls in.
 *
 * `now` is passed rather than read, so this is testable and so a list rendered
 * at 23:59 and re-rendered at 00:01 is not two different opinions of "today".
 */
export function workBand(task: WorkItem, now: Date = new Date()): WorkBand {
  if (task.status === 'BLOCKED') return 'blocked';
  if (UNDER_WAY.has(task.status)) return 'doing';

  if (!task.dueDate) return 'upcoming';
  const due = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return 'upcoming';

  const today = dayKey(now);
  const dueDay = dayKey(due);
  if (dueDay < today) return 'overdue';
  if (dueDay === today) return 'today';
  return 'upcoming';
}

const BAND_ORDER: Record<WorkBand, number> = {
  doing: 0,
  blocked: 1,
  overdue: 2,
  today: 3,
  upcoming: 4,
};

/**
 * Order a person's own work, most-do-this-next first.
 *
 * Finished work sinks to the bottom rather than being dropped: a list that
 * silently removes what you just completed leaves somebody wondering whether it
 * saved.
 */
export function rankMyWork<T extends WorkItem>(tasks: T[], now: Date = new Date()): T[] {
  return [...tasks].sort((a, b) => {
    const aDone = isOver(a.status);
    const bDone = isOver(b.status);
    if (aDone !== bDone) return aDone ? 1 : -1;

    const band = BAND_ORDER[workBand(a, now)] - BAND_ORDER[workBand(b, now)];
    if (band !== 0) return band;

    const pri = (PRIORITY_RANK[a.priority ?? 'MEDIUM'] ?? 2) - (PRIORITY_RANK[b.priority ?? 'MEDIUM'] ?? 2);
    if (pri !== 0) return pri;

    // Undated work sits behind dated work of the same urgency: a job with a day
    // attached is a promise to somebody, and one without is not yet.
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;

    // Stable to the end, so the list does not reshuffle between refreshes.
    return (a.title ?? '').localeCompare(b.title ?? '') || a.id.localeCompare(b.id);
  });
}

/**
 * The i18n key for a band's heading.
 *
 * The KEY is shared, the words are not: both clients name the same band with the
 * same key so a heading cannot read "Doing now" on the phone and "In progress"
 * on the web, while each still renders in the reader's language.
 */
export const WORK_BAND_KEY: Record<WorkBand, string> = {
  doing: 'tasks.myWork.bands.doing',
  blocked: 'tasks.myWork.bands.blocked',
  overdue: 'tasks.myWork.bands.overdue',
  today: 'tasks.myWork.bands.today',
  upcoming: 'tasks.myWork.bands.upcoming',
};

/** The bands in the order they are shown. */
export const WORK_BANDS: WorkBand[] = ['doing', 'blocked', 'overdue', 'today', 'upcoming'];

/**
 * Group a person's work into bands, in order, dropping the empty ones.
 *
 * Returned rather than computed per band by the caller, so a screen renders
 * `bandsOf(tasks)` and cannot accidentally show a heading with nothing under it
 * or order the bands differently from the ranking itself.
 */
export function bandsOf<T extends WorkItem>(
  tasks: T[],
  now: Date = new Date(),
): Array<{ band: WorkBand; key: string; items: T[] }> {
  const ranked = rankMyWork(tasks, now);
  return WORK_BANDS.map((band) => ({
    band,
    key: WORK_BAND_KEY[band],
    items: ranked.filter((t) => !isOver(t.status) && workBand(t, now) === band),
  })).filter((g) => g.items.length > 0);
}

/**
 * How late something is, in whole days. Negative is still to come.
 *
 * Whole DAYS rather than hours, because "2 days late" is what a person says and
 * "51 hours late" is not — and because the due date is a day, not a moment.
 */
export function daysLate(dueDate: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!dueDate) return null;
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const startOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOf(now) - startOf(due)) / 86_400_000);
}

/** What is worth saying about somebody's own list in one line. */
export interface MyWorkSummary {
  total: number;
  doing: number;
  blocked: number;
  overdue: number;
  today: number;
  /** The one to open. Null when there is nothing outstanding. */
  next: WorkItem | null;
}

export function summariseMyWork<T extends WorkItem>(tasks: T[], now: Date = new Date()): MyWorkSummary {
  const open = tasks.filter((t) => !isOver(t.status));
  const ranked = rankMyWork(open, now);
  const count = (b: WorkBand) => open.filter((t) => workBand(t, now) === b).length;
  return {
    total: open.length,
    doing: count('doing'),
    blocked: count('blocked'),
    overdue: count('overdue'),
    today: count('today'),
    next: ranked[0] ?? null,
  };
}

/** Is this task finished, by any of the names a workflow might give it? */
export function isWorkOver(status: string): boolean {
  return isOver(status);
}
