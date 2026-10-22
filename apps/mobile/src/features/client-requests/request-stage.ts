import type { OfficeRequest } from '../../lib/api/portal-office';

/* Pure — no API import, so the rule is testable without the app's native modules. */
export type RequestStage = 'waiting' | 'job' | 'done';

/**
 * Where a request stands: waiting for somebody to turn it into a job; a job
 * under way; or done — its job reached the last step of its flow.
 */
export function stageOf(r: OfficeRequest): RequestStage {
  if (!r.triaged) return 'waiting';
  const steps = r.timeline ?? [];
  const last = steps[steps.length - 1];
  return last && last.state !== 'pending' ? 'done' : 'job';
}
