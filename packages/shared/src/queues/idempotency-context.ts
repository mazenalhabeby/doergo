import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The Idempotency-Key of the request currently being handled, if it has one.
 *
 * Set by the gateway's idempotency interceptor around the handler; read by
 * `BaseQueueService.addJobAndWait` to derive the BullMQ job id. That closes the
 * one gap the Redis claim cannot: a request whose 30 s wait timed out while its
 * job was still running. Its retry adds a job with the SAME id, which BullMQ
 * treats as the existing job — the retry waits for the first attempt's result
 * instead of doing the work a second time.
 */
export interface RequestIdempotency {
  key: string;
  userId: string;
}

export const requestIdempotency = new AsyncLocalStorage<RequestIdempotency>();

/** A BullMQ-safe job id for this request's key, or null without one. */
export function idempotentJobId(jobType: string): string | null {
  const ctx = requestIdempotency.getStore();
  if (!ctx) return null;
  // BullMQ refuses ':' in custom ids — keys and user ids are [A-Za-z0-9_-].
  return `${jobType.replace(/[^A-Za-z0-9_.-]/g, '_')}__${ctx.userId}__${ctx.key}`;
}
