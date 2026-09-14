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
  // An HttpException built from an object carries `code` / `params` in its
  // response body; keep them, or the gateway can only pass on English.
  const response = typeof error?.getResponse === 'function' ? error.getResponse() : null;
  const code = typeof response?.code === 'string' ? response.code : typeof error?.code === 'string' ? error.code : undefined;
  const params = response?.params && typeof response.params === 'object' ? response.params : undefined;
  const payload = JSON.stringify({
    message: error?.message ?? 'Job failed',
    statusCode,
    ...(code ? { code } : {}),
    ...(params ? { params } : {}),
  });
  return statusCode < 500 ? new UnrecoverableError(payload) : new Error(payload);
}
