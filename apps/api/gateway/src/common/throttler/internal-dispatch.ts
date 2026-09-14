import { randomBytes, timingSafeEqual } from 'crypto';

/**
 * Marks a request the gateway sent to ITSELF while replaying a phone's queue.
 *
 * `/sync/push` replays each queued operation against the gateway's own route so
 * every guard applies unchanged. Those replays carry the phone's real IP
 * (X-Forwarded-For), so without an exemption a 50-operation push would trip the
 * phone's own 10-requests-per-second limit on its eleventh operation. The push
 * request itself is still limited; the replays inside it are not counted twice.
 *
 * ⚠️ A secret per PROCESS, never configured and never sent anywhere but
 * 127.0.0.1. Replays go to the same process that generated it, so replicas need
 * no shared value — and a secret that exists only in memory cannot leak from an
 * env file or be guessed by a client trying to skip the rate limit.
 */
export const INTERNAL_DISPATCH_HEADER = 'x-internal-dispatch';

const SECRET = randomBytes(32).toString('hex');

export function internalDispatchSecret(): string {
  return SECRET;
}

export function isInternalDispatch(headerValue: unknown): boolean {
  if (typeof headerValue !== 'string' || headerValue.length !== SECRET.length) return false;
  return timingSafeEqual(Buffer.from(headerValue), Buffer.from(SECRET));
}
