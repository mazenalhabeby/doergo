import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isSyncOperationName,
  resolveSyncOperationPath,
  type SyncOperation,
  type SyncOperationResult,
  type SyncPushResponse,
} from '@hbcfield/shared';
import { INTERNAL_DISPATCH_HEADER, internalDispatchSecret } from '../../common/throttler/internal-dispatch';

/** Headers of the original request carried onto each replay. */
const FORWARDED_HEADERS = ['authorization', 'x-client-platform', 'x-app-version', 'accept-language', 'user-agent'] as const;

/** Stop starting new operations after this long; the rest come back as `retry`. */
const TIME_BUDGET_MS = 25_000;
/** One replay may take this long before it counts as a transient failure. */
const OPERATION_TIMEOUT_MS = 20_000;

export interface PushCaller {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

/**
 * Applies a phone's queued operations by replaying each against the gateway's
 * own route — see SYNC_OPERATIONS for why it never calls a service directly.
 *
 *  - Lanes run concurrently; operations in one lane run strictly in order.
 *  - A dependency in this batch that was not applied → `skipped`, not attempted.
 *  - A transient failure stops its lane: later operations in it come back
 *    `retry`, because running them out of order is worse than waiting.
 *  - A refusal does not stop its lane — an unrelated note after a refused status
 *    change should still land — but it does skip anything that depends on it.
 *  - The operation id is the Idempotency-Key, so a batch retried after a lost
 *    response replays stored answers instead of acting twice.
 */
@Injectable()
export class SyncPushService {
  private readonly logger = new Logger(SyncPushService.name);
  private readonly base: string;

  constructor(config: ConfigService) {
    const port = Number(config.get('PORT')) || 4000;
    const prefix = String(config.get('API_PREFIX') || 'api/v1').replace(/^\/+|\/+$/g, '');
    this.base = `http://127.0.0.1:${port}/${prefix}`;
  }

  async push(caller: PushCaller, operations: SyncOperation[]): Promise<SyncPushResponse> {
    const started = Date.now();
    /** One result per POSITION — a duplicated id must not overwrite the original's answer. */
    const results: (SyncOperationResult | undefined)[] = new Array(operations.length);
    /** The result of the first operation carrying each id, for dependency checks. */
    const byId = new Map<string, SyncOperationResult>();
    const inBatch = new Set(operations.map((o) => o.id));

    // Duplicate ids in one batch would make the second a replay of the first,
    // which is never what a client meant.
    const lanes = new Map<string, { op: SyncOperation; index: number }[]>();
    const seen = new Set<string>();
    operations.forEach((op, index) => {
      if (seen.has(op.id)) {
        results[index] = { id: op.id, status: 'rejected', code: 'DUPLICATE_OPERATION', message: 'The same operation id appears twice in this batch' };
        return;
      }
      seen.add(op.id);
      const lane = lanes.get(op.lane) ?? [];
      lane.push({ op, index });
      lanes.set(op.lane, lane);
    });

    const record = (index: number, result: SyncOperationResult) => {
      results[index] = result;
      if (!byId.has(result.id)) byId.set(result.id, result);
    };
    const settled = (id: string) => {
      const r = byId.get(id);
      return !!r && (r.status === 'applied' || r.status === 'replayed');
    };

    await Promise.all(
      [...lanes.values()].map(async (lane) => {
        let blocked = false;
        for (const { op, index } of lane) {
          if (blocked || Date.now() - started > TIME_BUDGET_MS) {
            record(index, { id: op.id, status: 'retry', code: blocked ? 'LANE_WAITING' : 'TIME_BUDGET', message: 'Not attempted in this push' });
            continue;
          }
          // Dependencies inside this batch must have gone through. Dependencies
          // from an earlier push are the client's to have confirmed first.
          const unmet = (op.dependsOn ?? []).filter((d) => inBatch.has(d) && !settled(d));
          if (unmet.length) {
            const waiting = unmet.some((d) => byId.get(d)?.status === 'retry' || !byId.has(d));
            record(index, waiting
              ? { id: op.id, status: 'retry', code: 'DEPENDENCY_WAITING', message: 'Waiting for an earlier operation' }
              : { id: op.id, status: 'skipped', code: 'DEPENDENCY_FAILED', message: 'An earlier step this depends on was not accepted' });
            if (waiting) blocked = true;
            continue;
          }
          const result = await this.apply(caller, op);
          record(index, result);
          if (result.status === 'retry') blocked = true;
        }
      }),
    );

    return {
      results: operations.map((o, i) => results[i] ?? { id: o.id, status: 'retry', code: 'NOT_ATTEMPTED' }),
      serverTime: new Date().toISOString(),
    };
  }

  /** Replay one operation against its route and translate the answer. */
  async apply(caller: PushCaller, op: SyncOperation): Promise<SyncOperationResult> {
    if (!isSyncOperationName(op.op)) {
      return { id: op.id, status: 'rejected', code: 'UNKNOWN_OPERATION', message: `Unknown operation ${op.op}` };
    }
    const payload = (op.payload ?? {}) as { params?: Record<string, string>; body?: unknown };
    const route = resolveSyncOperationPath(op.op, payload.params);
    if (!route.ok) return { id: op.id, status: 'rejected', code: 'INVALID_PARAMS', message: route.message };

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'idempotency-key': op.id,
      [INTERNAL_DISPATCH_HEADER]: internalDispatchSecret(),
    };
    for (const h of FORWARDED_HEADERS) {
      const v = caller.headers[h];
      if (typeof v === 'string') headers[h] = v;
    }
    // Audit and geolocation see the phone, not 127.0.0.1.
    if (caller.ip) headers['x-forwarded-for'] = caller.ip;

    let res: Response;
    try {
      res = await fetch(`${this.base}${route.path}`, {
        method: route.method,
        headers,
        body: route.method === 'DELETE' && payload.body === undefined ? undefined : JSON.stringify(payload.body ?? {}),
        signal: AbortSignal.timeout(OPERATION_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(`sync ${op.op} ${op.id}: ${(err as Error).message}`);
      return { id: op.id, status: 'retry', code: 'UNREACHABLE', message: 'The server could not complete this right now' };
    }

    const body = await res.json().catch(() => undefined) as any;
    const code: string | undefined = typeof body?.code === 'string' ? body.code : undefined;
    const message: string | undefined = typeof body?.message === 'string' ? body.message : Array.isArray(body?.message) ? body.message.join('; ') : undefined;

    if (res.ok) {
      return { id: op.id, status: res.headers.get('idempotent-replayed') === 'true' ? 'replayed' : 'applied', body: body?.data ?? body };
    }
    if (res.status === 409 && code !== 'IDEMPOTENCY_IN_PROGRESS') {
      return { id: op.id, status: 'conflict', code: code ?? 'CONFLICT', message, current: body?.current ?? body?.params?.current };
    }
    if (res.status === 409 || res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500) {
      return { id: op.id, status: 'retry', code: code ?? `HTTP_${res.status}`, message };
    }
    // 401 inside an authenticated push means the session ended mid-batch.
    if (res.status === 401) return { id: op.id, status: 'retry', code: 'UNAUTHENTICATED', message };
    return { id: op.id, status: 'rejected', code: code ?? `HTTP_${res.status}`, message };
  }
}
