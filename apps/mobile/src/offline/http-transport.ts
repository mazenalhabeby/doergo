import type { SyncMediaLink, SyncPullResponse, SyncPullScope, SyncPushResponse } from '@hbcfield/shared/client';
import { ApiError, fetchWithAuth } from '../lib/api/client';
import { uploadToPresignedUrl } from '../lib/api/attachments';
import { UploadFailure, type ObjectUploader } from './files/types';
import type { SyncTransport } from './sync-engine';
import type { OutboxOp } from './outbox/types';

/** The engine's way to the server: the same authenticated client every screen uses. */
export const httpSyncTransport: SyncTransport = {
  async push(ops: OutboxOp[]) {
    try {
      const res = await fetchWithAuth<SyncPushResponse>('/sync/push', {
        method: 'POST',
        body: JSON.stringify({
          operations: ops.map((o) => ({
            id: o.id,
            op: o.op,
            lane: o.lane,
            dependsOn: o.dependsOn.length ? o.dependsOn : undefined,
            payload: o.payload,
            evidence: o.evidence,
          })),
        }),
      });
      return { ok: true as const, results: res.results };
    } catch (err) {
      if (err instanceof ApiError) {
        // 0 is the client's "no connection" — the engine reads null as network.
        return { ok: false as const, status: err.statusCode || null, code: err.code };
      }
      return { ok: false as const, status: null };
    }
  },

  pull(scope: SyncPullScope, cursor: string | null) {
    const qs = new URLSearchParams({ scope, ...(cursor ? { cursor } : {}) });
    return fetchWithAuth<SyncPullResponse>(`/sync/pull?${qs.toString()}`);
  },
};

/** The two network steps of an upload, through the same client and PUT every screen uses. */
export const httpObjectUploader: ObjectUploader = {
  async presign(path, body) {
    try {
      return await fetchWithAuth<{ uploadUrl: string; fileKey: string }>(path, { method: 'POST', body: JSON.stringify(body) });
    } catch (err) {
      if (err instanceof ApiError) throw new UploadFailure(err.statusCode || null, err.code ?? `HTTP_${err.statusCode}`);
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
  return fetchWithAuth<SyncMediaLink[]>('/sync/media-links', { method: 'POST', body: JSON.stringify({ ids }) });
}
