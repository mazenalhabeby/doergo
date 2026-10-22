import {
  getEndOfMonth,
  getStartOfMonth,
  hasAccessModule,
  rankMyWork,
  localDateKey,
  workBand,
  daysLate,
  normalizeRole,
  Role,
} from '@hbcfield/shared/client';
import type { Task } from '@/lib/api/types';
import type { TasksListParams } from '@/lib/api/tasks';

export type Period = 'current' | 'upcoming' | 'history';

export const PERIODS: readonly Period[] = ['current', 'upcoming', 'history'];

/**
 * The date window each period asks for — unchanged from the tab it replaces:
 * Now is this month (plus undated and still-open overdue work), Upcoming is
 * next month onwards, History is up to the end of last month.
 */
export function periodParams(period: Period, now: Date = new Date()): Pick<TasksListParams, 'startDate' | 'endDate' | 'includeNoDueDate'> {
  switch (period) {
    case 'current':
      return { startDate: localDateKey(getStartOfMonth(now)), endDate: localDateKey(getEndOfMonth(now)), includeNoDueDate: true };
    case 'upcoming':
      return { startDate: localDateKey(getStartOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1))) };
    case 'history':
      return { endDate: localDateKey(getEndOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))) };
  }
}

/* ---------------- the facts about one row ---------------- */

/** What the list needs to know about a job that depends on WHO is looking and on its workflow. */
export interface JobFacts {
  /** Assigned to the reader. */
  mine: boolean;
  /** Finished or called off, by its own workflow. */
  closed: boolean;
  /** Called off, by its own workflow. */
  canceled: boolean;
  /** Under way on its own workflow (a custom step counts, not only the built-in ones). */
  underWay: boolean;
}

/* ---------------- bands ---------------- */

export type JobBand = 'doing' | 'blocked' | 'overdue' | 'today' | 'later' | 'done';

/** In the order they are drawn — `BANDS`. */
export const JOB_BANDS: readonly JobBand[] = ['doing', 'blocked', 'overdue', 'today', 'later', 'done'];

/**
 * Which well a job sits in — `band()`.
 *
 *  - over (finished or called off) → Done
 *  - Blocked → Blocked, whoever holds it
 *  - under way AND mine → Doing now. ⚠️ Somebody else's job under way is not
 *    what the READER is doing; it sits by its date (overdue, else today).
 *  - otherwise by its date, the shared `workBand` rule — upcoming reads Later.
 */
export function bandOf(
  task: Pick<Task, 'status' | 'dueDate' | 'priority' | 'id' | 'title'>,
  facts: JobFacts,
  now: Date = new Date(),
): JobBand {
  if (facts.closed) return 'done';
  if (task.status === 'BLOCKED') return 'blocked';
  const shared = workBand(task as never, now);
  if (facts.underWay || shared === 'doing') {
    if (facts.mine) return 'doing';
    return (daysLate(task.dueDate ?? null, now) ?? 0) > 0 ? 'overdue' : 'today';
  }
  if (shared === 'upcoming') return 'later';
  if (shared === 'blocked') return 'blocked';
  return shared;
}

export interface JobGroup<T> {
  band: JobBand;
  items: T[];
}

/**
 * The wells, in order, empty ones dropped. Inside a well the shared ranking
 * decides (urgency, then the day, then the title) — the same order the home
 * widget reads, so the two cannot disagree about which job comes first.
 */
export function groupJobs<T extends Task>(tasks: readonly T[], factsOf: (t: T) => JobFacts, now: Date = new Date()): JobGroup<T>[] {
  const ranked = rankMyWork([...tasks] as never[], now) as unknown as T[];
  const by = new Map<JobBand, T[]>();
  for (const t of ranked) {
    const b = bandOf(t, factsOf(t), now);
    const list = by.get(b) ?? [];
    list.push(t);
    by.set(b, list);
  }
  return JOB_BANDS.filter((b) => (by.get(b)?.length ?? 0) > 0).map((b) => ({ band: b, items: by.get(b)! }));
}

/* ---------------- filters ---------------- */

export type JobsFilter = 'all' | 'nobody' | 'active' | 'notStarted' | 'blocked' | 'done' | 'canceled';

/**
 * ⭐ THE CHIPS FOLLOW THE QUESTION — and the data.
 *
 * One fixed row asked "Active? Blocked?" of next week, where nothing has
 * started and nothing can be blocked. Each period now offers only what can
 * be true in it, and `chipsFor` then drops any chip with nothing behind it:
 *
 *   Now       Nobody on · Active · Blocked · Done · Cancelled
 *   Upcoming  Nobody on · Not started · Blocked
 *   History   Done · Cancelled
 *
 * "Nobody on" only for the person overseeing — an executor is never shown
 * work that is nobody's. All is always there.
 */
export const BY_PERIOD: Record<Period, JobsFilter[]> = {
  current: ['nobody', 'active', 'blocked', 'done', 'canceled'],
  upcoming: ['nobody', 'notStarted', 'blocked'],
  history: ['done', 'canceled'],
};

/** The chips a period may offer, before counting. */
export function filtersFor(oversee: boolean, period: Period = 'current'): JobsFilter[] {
  return ['all', ...BY_PERIOD[period].filter((f) => oversee || f !== 'nobody')];
}

/** Nobody has been given it — neither the one assignee nor any of the several. */
export function nobodyOn(task: Pick<Task, 'assignedToId'> & { assignees?: unknown[] | null }): boolean {
  return !task.assignedToId && !(task.assignees?.length);
}

/**
 * Does a job pass the chip?
 *  - Active = what is on today's plate: doing now, overdue, or today
 *  - Not started = open, given out, and nobody has begun it
 *  - Nobody on = open and given to nobody
 *  - Done = finished; Cancelled = called off (two different answers)
 */
export function passesFilter(task: Task, filter: JobsFilter, band: JobBand, facts: JobFacts): boolean {
  switch (filter) {
    case 'all': return true;
    case 'active': return band === 'doing' || band === 'today' || band === 'overdue';
    case 'notStarted': return !facts.closed && !facts.underWay && task.status !== 'BLOCKED' && !nobodyOn(task as never);
    case 'blocked': return task.status === 'BLOCKED';
    case 'nobody': return !facts.closed && nobodyOn(task as never);
    case 'done': return facts.closed && !facts.canceled;
    case 'canceled': return facts.canceled;
  }
}

export interface Chip { key: JobsFilter; count: number }

/** The chip in force: the chosen one while it still has jobs, else All. */
export function effectiveFilter(chosen: JobsFilter, chips: readonly Chip[]): JobsFilter {
  return chips.some((c) => c.key === chosen) ? chosen : 'all';
}

/** The count on the Blocked chip — what the chip would show. */
export function blockedCount(tasks: readonly Pick<Task, 'status'>[]): number {
  return tasks.filter((t) => t.status === 'BLOCKED').length;
}

/* ---------------- Next up ---------------- */

/**
 * Next up is drawn only on the plain view of now: no chip, no search. With a
 * chip or a search the list is an answer to a different question.
 */
export function showsNextUp(v: { period: Period; filter: JobsFilter; search: string }): boolean {
  return v.period === 'current' && v.filter === 'all' && !v.search.trim();
}

/**
 * The job Next up offers — the reader's own first open job, by band then by
 * the shared ranking. Never somebody else's: "what do I do next" has no
 * answer in another person's work.
 */
export function pickNextUp<T extends Task>(tasks: readonly T[], factsOf: (t: T) => JobFacts, now: Date = new Date()): T | null {
  const own = tasks.filter((t) => { const f = factsOf(t); return f.mine && !f.closed; });
  const groups = groupJobs(own, factsOf, now);
  return groups[0]?.items[0] ?? null;
}

/* ---------------- Plan my route ---------------- */

/**
 * Offered to somebody who drives (`drivesRoutes`), with stops today, on the
 * plain view of now. A chip or another period is a different question.
 */
export function showsRouteRow(v: { drives: boolean; stops: number; period: Period; filter: JobsFilter }): boolean {
  return v.drives && v.stops > 0 && v.period === 'current' && v.filter === 'all';
}

/* ---------------- a row ---------------- */

export type RowRight =
  | { kind: 'pending' }
  | { kind: 'late'; days: number }
  | { kind: 'done' }
  | { kind: 'due'; at: string }
  | { kind: 'none' };

/** The right-hand fact of a row — `jobRow()`: waiting to send, late, done, or when. */
export function rowRight(task: Pick<Task, 'dueDate'> & { pendingSync?: boolean }, facts: JobFacts, now: Date = new Date()): RowRight {
  if (task.pendingSync) return { kind: 'pending' };
  if (facts.closed) return facts.canceled ? { kind: 'none' } : { kind: 'done' };
  const late = daysLate(task.dueDate ?? null, now) ?? 0;
  if (late > 0) return { kind: 'late', days: late };
  return task.dueDate ? { kind: 'due', at: task.dueDate } : { kind: 'none' };
}

export type RowWho = { kind: 'you' } | { kind: 'nobody' } | { kind: 'name'; name: string } | null;

/**
 * Who has it — said only in Everyone, where the rows are other people's work.
 * In Mine (and for a member whose list IS their own) it is always the reader.
 */
export function rowWho(
  task: Pick<Task, 'assignedToId'> & { assignedTo?: { firstName?: string | null } | null; assignees?: unknown[] | null },
  facts: JobFacts,
  view: { oversee: boolean; everyone: boolean },
): RowWho {
  if (!view.oversee || !view.everyone) return null;
  if (facts.mine) return { kind: 'you' };
  if (nobodyOn(task as never)) return { kind: 'nobody' };
  const name = task.assignedTo?.firstName?.trim();
  return name ? { kind: 'name', name } : null;
}

/** "Industriezentrum NÖ-Süd" out of "Industriezentrum NÖ-Süd, Wr. Neudorf" — the place, not the postcode. */
export function placeOf(task: Pick<Task, 'locationAddress'> & { space?: { name?: string | null } | null }): string | null {
  const first = task.locationAddress?.split(',')[0]?.trim();
  return first || task.space?.name?.trim() || null;
}

/* ---------------- a row redraws only when what it shows changed ---------------- */

/** Same right-hand fact? By VALUE — `rowRight` builds a new object on every render. */
export function sameRowRight(a: RowRight, b: RowRight): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'late') return a.days === (b as { days: number }).days;
  if (a.kind === 'due') return a.at === (b as { at: string }).at;
  return true;
}

/** Same "who has it"? By value, for the same reason. */
export function sameRowWho(a: RowWho, b: RowWho): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.kind !== b.kind) return false;
  return a.kind !== 'name' || a.name === (b as { name: string }).name;
}

/**
 * ⚠️ THE ROW'S MEMO. `memo(JobRow)` compared `who` and `right` by reference,
 * and both are rebuilt for every row on every render of the list — so every
 * visible row redrew whenever anything on the screen changed (a keystroke in
 * search, a chip). Everything else a row takes is a primitive or a stable
 * callback (`onOpen(id)`).
 */
export function sameJobRowProps<P extends { who: RowWho; right: RowRight }>(a: P, b: P): boolean {
  for (const k of Object.keys(a) as (keyof P)[]) {
    if (k === 'who' || k === 'right') continue;
    if (a[k] !== b[k]) return false;
  }
  if (Object.keys(b).length !== Object.keys(a).length) return false;
  return sameRowWho(a.who, b.who) && sameRowRight(a.right, b.right);
}

/* ---------------- the empty well ---------------- */

export type EmptyKind = 'search' | 'blocked' | 'history' | 'none';

export function emptyKind(v: { search: string; filter: JobsFilter; period: Period }): EmptyKind {
  if (v.search.trim()) return 'search';
  if (v.filter === 'blocked') return 'blocked';
  if (v.period === 'history') return 'history';
  return 'none';
}

/* ---------------- who may make one ---------------- */

/**
 * The New job disc — the same question the tab bar asks for the New job tab:
 * an admin, or the `create_task` module (which IS the create permission,
 * org-wide or held in a space).
 */
export function canCreateJobs(user: { role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return normalizeRole(user.role ?? '') === Role.ADMIN || hasAccessModule(user as never, 'create_task');
}
