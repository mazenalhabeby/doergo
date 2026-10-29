import { FIELD_SERVICE_FLOW, ONE_AT_A_TIME_STATUSES, stepCapabilities, stepStartsWork } from '@hbcfield/shared';

/**
 * WHICH moves the execution checks ask about — read from the step's capabilities,
 * as the clock gate already does, never from a list of step names.
 *
 * The site, due-date and one-job-at-a-time checks fired on ARRIVED / IN_PROGRESS,
 * EN_ROUTE and ACCEPTED only, so a job on the organization's own flow (DRIVING,
 * ON_SITE, DOING…) skipped all three. The canonical flow answers exactly as
 * before: EN_ROUTE is `gps + timer`, ARRIVED / IN_PROGRESS are `timer` after it.
 */
export type FlowSteps = {
  name?: string | null;
  statuses?: Array<{ key: string; capabilities?: string[] | null }> | null;
} | null;

const caps = (flow: FlowSteps, key: string) => stepCapabilities(flow, key);
const travels = (flow: FlowSteps, key: string) => caps(flow, key).includes('gps');

/** The flow's steps in order — its own, else the built-in field-service flow. */
function orderedKeys(flow: FlowSteps): string[] {
  return flow?.statuses?.length ? flow.statuses.map((s) => s.key) : FIELD_SERVICE_FLOW.map((s) => s.key);
}

/**
 * Setting off: a working step that travels (gps + timer). The due-date gate asks
 * it — nobody sets off for a job due on a later day.
 */
export function stepSetsOff(flow: FlowSteps, target: string): boolean {
  return stepStartsWork(target, caps(flow, target)) && travels(flow, target);
}

/**
 * Being AT the job: a working step that does not travel, reached after the flow's
 * travel step. A flow with no travel step never asks where the person is — its
 * work is not at the job's pin (an office ticket with the customer's address).
 */
export function stepNeedsSite(flow: FlowSteps, target: string): boolean {
  if (!stepStartsWork(target, caps(flow, target)) || travels(flow, target)) return false;
  let keys = orderedKeys(flow);
  // A step the flow does not define (mixed legacy data) is judged on the built-in flow, as its capabilities are.
  if (!keys.includes(target)) keys = FIELD_SERVICE_FLOW.map((s) => s.key);
  const at = keys.indexOf(target);
  return at > 0 && keys.slice(0, at).some((k) => travels(flow, k));
}

/** Arriving (rather than starting): the move comes straight from a travel step. */
export function stepArrives(flow: FlowSteps, from: string): boolean {
  return travels(flow, from);
}

/**
 * Holds the one-job-at-a-time slot: taking the job on (the canonical ACCEPTED…)
 * or any step where work time runs. BLOCKED holds nothing — blocking frees the slot.
 */
export function stepHoldsSlot(flow: FlowSteps, key: string): boolean {
  return (ONE_AT_A_TIME_STATUSES as readonly string[]).includes(key) || stepStartsWork(key, caps(flow, key));
}

/** Every step key that holds the slot in any of these flows (plus the canonical ones) — one query's filter. */
export function slotKeysOf(flows: FlowSteps[]): string[] {
  const keys = new Set<string>(ONE_AT_A_TIME_STATUSES);
  for (const flow of flows) for (const s of flow?.statuses ?? []) if (stepHoldsSlot(flow, s.key)) keys.add(s.key);
  return [...keys];
}
