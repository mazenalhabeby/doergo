/**
 * How far a task type reaches, and whether a flow is worth running.
 *
 * Three rungs, narrowest first. The rung is a property of the workflow, not of
 * who is looking at it, so the server and every screen answer the same way.
 *
 *   space        — created in, or forked into, one space. Only that space may
 *                  offer it. This is the DEFAULT for anything made from a space,
 *                  because widening later is a click and narrowing after five
 *                  spaces adopted it is a migration.
 *   organization — any space in the org may offer it. One definition, so a typo
 *                  is fixed once. This is what "five sites, one process" needs.
 *   library      — every organization, after a curator publishes it. Never
 *                  reached by an org's own action; see `submitToLibrary`.
 *
 * A space-scoped type is still an org-owned row with `ownerSpaceId` set, not a
 * separate ownership model — so tenancy checks, cache keys and query costs are
 * the ones that were already there.
 */

import type { ValidatableStatus } from './workflow-validation';
import { CAPABILITY_MODULE } from './workflow-modules';

export type WorkflowScope = 'space' | 'organization' | 'library';

/** The scope of a stored workflow row. Library rows are a different table. */
export function workflowScope(workflow: { ownerSpaceId?: string | null } | null | undefined): WorkflowScope {
  return workflow?.ownerSpaceId ? 'space' : 'organization';
}

/**
 * May this space offer this workflow?
 *
 * A local type belongs to exactly one space. Attaching it elsewhere would make
 * "local" mean nothing, and would quietly give a second space edit rights over
 * a flow the first one thinks is private.
 */
export function spaceMayOffer(
  workflow: { ownerSpaceId?: string | null } | null | undefined,
  spaceId: string,
): boolean {
  if (!workflow) return false;
  return !workflow.ownerSpaceId || workflow.ownerSpaceId === spaceId;
}

// ── Best-practice advice ─────────────────────────────────────────────────────

export type WorkflowAdviceCode =
  | 'no_cancel_path'
  | 'no_exception_path'
  | 'too_many_steps'
  | 'single_step'
  | 'capability_on_final'
  | 'no_capabilities';

export interface WorkflowAdvice {
  code: WorkflowAdviceCode;
  message: string;
}

/**
 * A flow that is sound but would be unpleasant to work.
 *
 * Deliberately SEPARATE from `validateWorkflow`, which refuses flows that trap
 * work. These do not block anything: a two-step flow is a legitimate choice, and
 * a builder that argues with every decision stops being read. They exist so
 * somebody designing their first task type is told what experienced flows have
 * that theirs does not, at the moment they can still act on it.
 */
export function workflowAdvice(
  statuses: (ValidatableStatus & { capabilities?: string[] | null })[] | null | undefined,
): WorkflowAdvice[] {
  const list = statuses ?? [];
  if (list.length === 0) return [];

  const out: WorkflowAdvice[] = [];
  const working = list.filter((s) => !s.isFinal && !s.isCanceled);

  if (!list.some((s) => s.isCanceled)) {
    out.push({
      code: 'no_cancel_path',
      message: 'No step marks work as canceled, so a job called off has nowhere to go but "finished".',
    });
  }

  // An exception step is what a member reaches for when reality disagrees with
  // the plan. Without one they finish work that is not done, or leave it open.
  const hasReturningStep = working.some((s) =>
    (s.transitions ?? []).some((t) => {
      const target = list.find((x) => x.key === t);
      return !!target && (target.position ?? 0) < (s.position ?? 0);
    }),
  );
  if (working.length > 2 && !hasReturningStep) {
    out.push({
      code: 'no_exception_path',
      message: 'Every step moves forward only. Consider a blocked or on-hold step that can return to the work.',
    });
  }

  if (list.length === 1) {
    out.push({ code: 'single_step', message: 'One step means nothing to track. Most flows need at least a start and a finish.' });
  }

  if (list.length > 12) {
    out.push({
      code: 'too_many_steps',
      message: `${list.length} steps is a lot to move a job through. Flows people actually use tend to have five to eight.`,
    });
  }

  // A capability is something a member DOES at a step. On a finished step there
  // is no longer a step to do it at — except sign-off and the report, which are
  // exactly what completing the work produces.
  const completionCaps = new Set(['report', 'signature', 'photos']);
  const misplaced = list.filter(
    (s) => s.isFinal && (s.capabilities ?? []).some((c) => CAPABILITY_MODULE[c] && !completionCaps.has(c)),
  );
  for (const s of misplaced) {
    out.push({
      code: 'capability_on_final',
      message: `"${s.name || s.key}" is a finished step but still asks the member to do something. Move that to the step before it.`,
    });
  }

  if (!list.some((s) => (s.capabilities ?? []).length > 0)) {
    out.push({
      code: 'no_capabilities',
      message: 'No step asks for anything — no timer, photos, checklist or sign-off. Tasks will only change status.',
    });
  }

  return out;
}
