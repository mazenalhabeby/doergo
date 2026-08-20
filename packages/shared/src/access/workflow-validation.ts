/**
 * Is this workflow sound enough to run work through?
 *
 * A workflow is a state machine that people's jobs move along, and the ways it
 * can be wrong are quiet ones: a status nothing transitions to is a column
 * nobody can reach; a status with no way out is a task stuck forever; a
 * transition naming a key that does not exist is a dead end that reads as a
 * route. None of these fail loudly — they fail months later, on one task, in
 * one space.
 *
 * Reported while building, enforced when USED. Validating every edit would make
 * the builder hostile: a workflow with one status is legitimately unfinished,
 * not wrong. So the builder shows what is missing as you go, and a workflow is
 * refused when it is attached to a space or a task is created on it.
 *
 * Pure, so the same list appears in the builder and in the refusal.
 */

export interface ValidatableStatus {
  key: string;
  name?: string;
  position?: number;
  isFinal?: boolean | null;
  isCanceled?: boolean | null;
  transitions?: string[] | null;
}

export type WorkflowProblemCode =
  | 'empty'
  | 'no_final'
  | 'unknown_transition'
  | 'unreachable'
  | 'dead_end'
  | 'duplicate_key';

export interface WorkflowProblem {
  code: WorkflowProblemCode;
  /** The status this is about, where one is to blame. */
  statusKey?: string;
  /** Ready to read: says what is wrong and, where it can, which step. */
  message: string;
}

/** The step a task starts at: the lowest position, matching task creation. */
export function entryStatusKey(statuses: ValidatableStatus[]): string | null {
  if (statuses.length === 0) return null;
  const ordered = [...statuses]
    .filter((s) => !s.isCanceled)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return (ordered[0] ?? statuses[0])?.key ?? null;
}

/**
 * Everything wrong with this workflow. Empty means it is safe to use.
 */
export function validateWorkflow(statuses: ValidatableStatus[] | null | undefined): WorkflowProblem[] {
  const list = statuses ?? [];
  const problems: WorkflowProblem[] = [];

  if (list.length === 0) {
    return [{ code: 'empty', message: 'This task type has no steps yet.' }];
  }

  const label = (s: ValidatableStatus) => s.name || s.key;
  const keys = new Set(list.map((s) => s.key));

  // A duplicate key makes "which step is this?" unanswerable — a task's status
  // would match two rows with different rules.
  const seen = new Set<string>();
  for (const s of list) {
    if (seen.has(s.key)) {
      problems.push({ code: 'duplicate_key', statusKey: s.key, message: `Two steps share the key "${s.key}".` });
    }
    seen.add(s.key);
  }

  // Something must be completable, or work enters and never leaves.
  if (!list.some((s) => s.isFinal)) {
    problems.push({ code: 'no_final', message: 'No step is marked as finished, so nothing can ever be completed.' });
  }

  // A transition to a key that does not exist reads as a route and is not one.
  for (const s of list) {
    for (const target of s.transitions ?? []) {
      if (!keys.has(target)) {
        problems.push({
          code: 'unknown_transition',
          statusKey: s.key,
          message: `"${label(s)}" points to a step that does not exist ("${target}").`,
        });
      }
    }
  }

  // A step with no way out must SAY it is the end, rather than being one by
  // omission — otherwise a task arrives and can never move again.
  for (const s of list) {
    const outgoing = (s.transitions ?? []).filter((k) => keys.has(k));
    if (outgoing.length === 0 && !s.isFinal && !s.isCanceled) {
      problems.push({
        code: 'dead_end',
        statusKey: s.key,
        message: `"${label(s)}" has no next step and is not marked finished — a task here could not move again.`,
      });
    }
  }

  // A step nothing reaches is a column no work can ever be in.
  const entry = entryStatusKey(list);
  const reachable = new Set<string>(entry ? [entry] : []);
  const queue = entry ? [entry] : [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = list.find((s) => s.key === current);
    for (const next of node?.transitions ?? []) {
      if (keys.has(next) && !reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  for (const s of list) {
    // A cancellation step is reached by cancelling, not by following the flow.
    if (s.isCanceled) continue;
    if (!reachable.has(s.key)) {
      problems.push({
        code: 'unreachable',
        statusKey: s.key,
        message: `Nothing leads to "${label(s)}", so no task can ever be in it.`,
      });
    }
  }

  return problems;
}

/** Shorthand for the places that only need a yes or no. */
export function isWorkflowUsable(statuses: ValidatableStatus[] | null | undefined): boolean {
  return validateWorkflow(statuses).length === 0;
}
