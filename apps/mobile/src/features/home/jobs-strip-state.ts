/**
 * What the home jobs strip says — pure, so the words are tested, not eyeballed.
 *
 * Stopped work (packages/shared/src/tasks/handover.ts), in one order:
 *   a handover note still owed → asked on EVERY open until written (it never
 *   blocks anything; it nags);
 *   a job paused on me → offered only once I am clocked in again ("You paused
 *   a job yesterday — Resume work"); before that, resuming is not possible.
 */
import type { MyHandovers } from '@/lib/api';

export type JobsStripKind = 'owed' | 'paused';

export interface JobsStripItem {
  kind: JobsStripKind;
  taskId: string;
  title: string;
  /** My working minutes on a paused job so far — "2h 15m so far". */
  workedMinutes?: number;
}

export function jobsStripItems(mine: Pick<MyHandovers, 'owed' | 'paused'>, clockedIn: boolean): JobsStripItem[] {
  const owed = mine.owed.map((j) => ({ kind: 'owed' as const, taskId: j.id, title: j.title }));
  const seen = new Set(owed.map((o) => o.taskId));
  const paused = clockedIn
    ? mine.paused
        .filter((j) => !seen.has(j.id))
        .map((j) => ({
          kind: 'paused' as const,
          taskId: j.id,
          title: j.title,
          ...(j.workedMinutes ? { workedMinutes: j.workedMinutes } : {}),
        }))
    : [];
  return [...owed, ...paused];
}

/** The two lines, as keys + values. The first item is named; the rest are counted. */
export function jobsStripLines(
  items: JobsStripItem[],
): { title: { k: string; v: Record<string, unknown> }; sub: { k: string; v: Record<string, unknown> } } | null {
  const first = items[0];
  if (!first) return null;
  const more = items.length - 1;
  return {
    title: first.kind === 'owed'
      ? { k: 'jobsStrip.owedTitle', v: { title: first.title } }
      : { k: 'jobsStrip.pausedTitle', v: { title: first.title } },
    sub: more > 0
      ? { k: 'jobsStrip.more', v: { count: more } }
      : first.kind === 'owed'
        ? { k: 'jobsStrip.owedSub', v: {} }
        : first.workedMinutes
          ? { k: 'jobsStrip.pausedSoFar', v: { minutes: first.workedMinutes } }
          : { k: 'jobsStrip.pausedSub', v: {} },
  };
}
