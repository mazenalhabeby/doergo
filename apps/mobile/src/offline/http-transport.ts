import type { SyncPullResponse, SyncPullScope, SyncPushResponse } from '@hbcfield/shared/client';
import { ApiError, fetchWithAuth } from '../lib/api/client';
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
