/**
 * The Jobs tab's decisions — `docs/design/job-flow.html`, `renderJobs()`,
 * `band()`, `BANDS`, `jobRow()`.
 *
 * ⚠️ PURE AND REACT-NATIVE-FREE on purpose, like `job/job-logic.ts`: every
 * rule the list acts on is tested (`jobs-tab-*.spec.ts`), and the screen only
 * draws what these return.
 */
import {
  getEndOfMonth, getStartOfMonth, hasAccessModule, rankMyWork, localDateKey, workBand,
  daysLate, normalizeRole, Role,
} from '@hbcfield/shared/client';
import type { Task } from '../../lib/api/types';
import type { TasksListParams } from '../../lib/api/tasks';
import {
  type Period,
  type JobFacts,
  bandOf,
  type JobsFilter,
  filtersFor,
  passesFilter,
  type Chip,
} from './period';
export {
  type Period,
  type JobFacts,
  bandOf,
  type JobsFilter,
  filtersFor,
  passesFilter,
  type Chip,
  PERIODS,
  periodParams,
  type JobBand,
  groupJobs,
  nobodyOn,
  effectiveFilter,
  blockedCount,
  showsNextUp,
  pickNextUp,
  showsRouteRow,
  type RowRight,
  rowRight,
  type RowWho,
  rowWho,
  placeOf,
  sameRowRight,
  sameRowWho,
  sameJobRowProps,
  emptyKind,
  canCreateJobs,
} from './period';

/* ---------------- the period ---------------- */
/**
 * The chips to draw: this period's, each with how many jobs it holds, and
 * only those holding any. One pass over the list.
 */
export function chipsFor(
  tasks: readonly Task[],
  v: { oversee: boolean; period: Period },
  factsOf: (t: Task) => JobFacts,
  now: Date = new Date(),
): Chip[] {
  const keys = filtersFor(v.oversee, v.period);
  const counts = new Map<JobsFilter, number>(keys.map((k) => [k, 0]));
  for (const task of tasks) {
    const f = factsOf(task);
    const band = bandOf(task, f, now);
    for (const k of keys) if (passesFilter(task, k, band, f)) counts.set(k, counts.get(k)! + 1);
  }
  return keys.map((k) => ({ key: k, count: counts.get(k)! })).filter((c) => c.key === 'all' || c.count > 0);
}
