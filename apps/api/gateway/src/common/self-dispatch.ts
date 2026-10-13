import type { ConfigService } from '@nestjs/config';
import { INTERNAL_DISPATCH_HEADER, internalDispatchSecret } from './throttler/internal-dispatch';

/**
 * The gateway calling ITS OWN routes as the caller — so every guard, scope and
 * service rule runs unchanged, never re-stated. Used by the phone's queue
 * replay (`/sync/push`) and the approvals inbox, which reads thirteen existing
 * lists and decides through their existing actions.
 *
 * ⚠️ Only to 127.0.0.1 with the per-process secret (internal-dispatch.ts): the
 * calls skip the rate limits the outer request already passed, nothing else.
 */

/** Headers of the original request carried onto each call. */
export const SELF_DISPATCH_FORWARDED_HEADERS = ['authorization', 'x-client-platform', 'x-app-version', 'accept-language', 'user-agent'] as const;

export interface SelfDispatchCaller {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

export function selfDispatchBase(config: ConfigService): string {
  const port = Number(config.get('PORT')) || 4000;
  const prefix = String(config.get('API_PREFIX') || 'api/v1').replace(/^\/+|\/+$/g, '');
  return `http://127.0.0.1:${port}/${prefix}`;
}

export function selfDispatchHeaders(caller: SelfDispatchCaller, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [INTERNAL_DISPATCH_HEADER]: internalDispatchSecret(),
    ...extra,
  };
  for (const h of SELF_DISPATCH_FORWARDED_HEADERS) {
    const v = caller.headers[h];
    if (typeof v === 'string') headers[h] = v;
  }
  // Audit and geolocation see the caller, not 127.0.0.1.
  if (caller.ip) headers['x-forwarded-for'] = caller.ip;
  return headers;
}
