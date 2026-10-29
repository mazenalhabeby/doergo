import { TaskStatus, stepCapabilities, stepStartsWork } from '@hbcfield/shared';

/** A workflow as the cache gives it: its steps, each with what marks it. */
export type FlowForStep = {
  name?: string | null;
  statuses?: Array<{ key: string; isFinal?: boolean | null; isCanceled?: boolean | null; capabilities?: string[] | null }> | null;
} | null;

/**
 * Where a job stands, read from ITS workflow — never from a list of step names.
 *
 * Edit and delete only recognised COMPLETED / CLOSED / CANCELED / IN_PROGRESS, so a
 * job on a custom flow (DONE, DELIVERED, DOING…) could be rewritten after it
 * finished and deleted while somebody worked on it. The flow marks its own end
 * (isFinal / isCanceled) and its working steps (capabilities — the clock gate's
 * rule); the canonical names answer only for a step the flow does not define.
 *
 *   finished — a final, non-canceled step: the work was done
 *   canceled — a canceled step
 *   working  — a step where work time runs (stepStartsWork: timer, not ACCEPTED/BLOCKED)
 */
export function stepState(status: string, flow: FlowForStep) {
  const own = flow?.statuses?.find((s) => s.key === status);
  const finished = own
    ? !!own.isFinal && !own.isCanceled
    : status === TaskStatus.COMPLETED || status === TaskStatus.CLOSED;
  const canceled = own ? !!own.isCanceled : status === TaskStatus.CANCELED;
  const working = !finished && !canceled && stepStartsWork(status, stepCapabilities(flow, status));
  return { finished, canceled, working };
}
