import type { SyncMediaLink, SyncPullResponse, SyncPullScope, SyncPushResponse } from '@hbcfield/shared/client';
import { ApiError, api, call, E } from '../lib/api/client';
import { uploadToPresignedUrl } from '../lib/api/attachments';
import { UploadFailure, type ObjectUploader } from './files/types';
import { isPhoneOnlyKey } from './files/uploads';

/** The payload as the server takes it: route params and body, without the phone's own keys. */
function forServer(payload: OutboxOp['payload']): OutboxOp['payload'] {
  const body = payload.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return payload;
  return { ...payload, body: Object.fromEntries(Object.entries(body).filter(([k]) => !isPhoneOnlyKey(k))) };
}
import type { SyncTransport } from './sync-engine';
import type { OutboxOp } from './outbox/types';

/**
 * What the outbox has always recorded for a failure that is not the server's
 * answer. The client's codes moved onto the shared core (NETWORK, TIMEOUT —
 * status 0); the outbox keeps the ones it has always stored, so an operation's
 * history, `cancelPending` and the sync page read exactly as before:
 *   NETWORK → no status, NO_CONNECTION   ·   TIMEOUT → 408, SLOW_CONNECTION.
 * A refusal keeps its own status and code.
 */
export function outboxFailure(err: ApiError): { status: number | null; code: string | undefined } {
  if (err.kind === 'timeout') return { status: 408, code: 'SLOW_CONNECTION' };
  if (err.kind === 'network' || err.kind === 'aborted') {
    // SESSION_UNREACHABLE stays itself: the refresh, not the request, found no server.
    return { status: null, code: err.code === 'SESSION_UNREACHABLE' ? err.code : 'NO_CONNECTION' };
  }
  return { status: err.status || null, code: err.code };
}

/** The engine's way to the server: the same authenticated client every screen uses. */
export const httpSyncTransport: SyncTransport = {
  async push(ops: OutboxOp[]) {
    try {
      const res: SyncPushResponse = await call(E.sync.push, undefined, {
        body: {
          operations: ops.map((o) => ({
            id: o.id,
            op: o.op,
            lane: o.lane,
            dependsOn: o.dependsOn.length ? o.dependsOn : undefined,
            payload: forServer(o.payload),
            evidence: o.evidence,
          })),
        },
        // The outbox owns its retries and their backoff: one attempt per flush, as before.
        retry: false,
      });
      return { ok: true as const, results: res.results };
    } catch (err) {
      if (err instanceof ApiError) {
        // The engine reads a null status as "never answered".
        return { ok: false as const, ...outboxFailure(err) };
      }
      return { ok: false as const, status: null };
    }
  },

  pull(scope: SyncPullScope, cursor: string | null) {
    return call(E.sync.pull, { scope, cursor: cursor || undefined }) as Promise<SyncPullResponse>;
  },
};

/** The two network steps of an upload, through the same client and PUT every screen uses. */
export const httpObjectUploader: ObjectUploader = {
  async presign(path, body) {
    try {
      // The presign route comes from the queued operation itself (its op table row), not from a screen.
      return await api.post<Record<string, unknown>>(path, body, { retry: false });
    } catch (err) {
      if (err instanceof ApiError) {
        const f = outboxFailure(err);
        throw new UploadFailure(f.status, f.code ?? `HTTP_${err.status}`);
      }
      throw new UploadFailure(null, 'NETWORK');
    }
  },

  async put(uploadUrl, path, mime) {
    try {
      await uploadToPresignedUrl(uploadUrl, path, mime);
    } catch {
      // Storage refusing a link is almost always the link (expired, clock skew):
      // retrying asks for a fresh one. Never "failed" — the photo is still good.
      throw new UploadFailure(null, 'UPLOAD_FAILED');
    }
  },
};

/** Signed links for task photos this member may see, for the offline image cache. */
export function httpMediaLinks(ids: string[]): Promise<SyncMediaLink[]> {
  return call(E.sync.mediaLinks, undefined, { body: { ids } });
}
