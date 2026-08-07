import { UnrecoverableError } from 'bullmq';

/**
 * Build the error a BullMQ processor should throw for a failed job (H3).
 *
 * Business/client failures (4xx — validation, permission, not-found) are
 * deterministic: retrying them just burns the 3 configured attempts and delays
 * the user's error by ~3s of backoff. Return an `UnrecoverableError` so BullMQ
 * fails the job immediately without retry. Only 5xx / unexpected errors (which
 * may be transient infra blips) stay retryable.
 *
 * The payload is the same JSON shape the gateway's base-queue consumer already
 * parses (`{ message, statusCode }`), so error surfacing is unchanged — only the
 * retry decision differs.
 */
export function buildJobError(error: any): Error {
  const statusCode = error?.status || error?.statusCode || 500;
  const payload = JSON.stringify({
    message: error?.message ?? 'Job failed',
    statusCode,
  });
  return statusCode < 500 ? new UnrecoverableError(payload) : new Error(payload);
}
