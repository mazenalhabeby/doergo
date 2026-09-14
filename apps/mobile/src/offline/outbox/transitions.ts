import {
  outboxOutcomeFor,
  outboxOutcomeForResult,
  retryDelayMs,
  type SyncOperationResult,
} from '@hbcfield/shared/client';
import type { OutboxOp, OutboxState } from './types';

/** One outcome, applied. Pure: returns the new version of the operation. */
function settle(op: OutboxOp, state: OutboxState, now: number, extra: Partial<OutboxOp> = {}): OutboxOp {
  return { ...op, ...extra, state, updatedAt: now };
}

/** Mark a batch as in flight before sending it — a crash mid-push must not double-send out of order. */
export function markInflight(batch: readonly OutboxOp[], now: number): OutboxOp[] {
  return batch.map((op) => settle(op, 'inflight', now));
}

/** Apply the per-operation results of a push that reached the server. */
export function applyPushResults(
  batch: readonly OutboxOp[],
  results: readonly SyncOperationResult[],
  now: number,
  random?: () => number,
): OutboxOp[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  return batch.map((op) => {
    const result = byId.get(op.id);
    if (!result) return retry(op, now, { code: 'NO_RESULT' }, random);
    const error = result.code || result.message ? { code: result.code, message: result.message } : undefined;
    switch (outboxOutcomeForResult(result)) {
      case 'done':
        return settle(op, 'done', now, { response: result.body, lastError: undefined });
      case 'conflict':
        return settle(op, 'conflict', now, { response: result.current, lastError: error });
      case 'failed':
        return settle(op, 'failed', now, { lastError: error });
      default:
        // Not attempted because the lane was waiting is not a failed attempt.
        return result.code === 'LANE_WAITING' || result.code === 'DEPENDENCY_WAITING' || result.code === 'TIME_BUDGET'
          ? settle(op, 'pending', now)
          : retry(op, now, error, random);
    }
  });
}

/** The push itself did not come back with results (network, 5xx, 401…). */
export function applyPushFailure(
  batch: readonly OutboxOp[],
  httpStatus: number | null,
  code: string | undefined,
  now: number,
  random?: () => number,
): OutboxOp[] {
  const outcome = outboxOutcomeFor(httpStatus, code);
  return batch.map((op) => {
    if (outcome === 'awaiting_auth') return settle(op, 'awaiting_auth', now, { lastError: { code: code ?? 'UNAUTHENTICATED' } });
    if (outcome === 'failed') return settle(op, 'failed', now, { lastError: { code: code ?? `HTTP_${httpStatus}` } });
    return retry(op, now, { code: code ?? (httpStatus ? `HTTP_${httpStatus}` : 'NETWORK') }, random);
  });
}

export function failDependency(ops: readonly OutboxOp[], now: number): OutboxOp[] {
  return ops.map((op) =>
    settle(op, 'failed', now, { lastError: { code: 'DEPENDENCY_FAILED', message: 'An earlier step this depends on was not accepted' } }),
  );
}

/** Operations left in flight by a crash or a killed app go back to the queue. */
export function recoverInflight(ops: readonly OutboxOp[], now: number): OutboxOp[] {
  return ops.filter((o) => o.state === 'inflight').map((op) => settle(op, 'pending', now));
}

/** The member signed in again: resume what was waiting for them. */
export function resumeAuth(ops: readonly OutboxOp[], now: number): OutboxOp[] {
  return ops.filter((o) => o.state === 'awaiting_auth').map((op) => settle(op, 'pending', now, { lastError: undefined }));
}

function retry(op: OutboxOp, now: number, error: OutboxOp['lastError'], random?: () => number): OutboxOp {
  const attempts = op.attempts + 1;
  return settle(op, 'retry', now, { attempts, nextAttemptAt: now + retryDelayMs(attempts, random), lastError: error });
}
