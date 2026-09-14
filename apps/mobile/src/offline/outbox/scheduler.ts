import { SYNC_PUSH_MAX_OPS } from '@hbcfield/shared/client';
import type { OutboxOp } from './types';

export interface Selection {
  /** Operations to push now, in order. */
  batch: OutboxOp[];
  /** Operations whose dependency ended badly: fail them without sending. */
  dependencyFailed: OutboxOp[];
  /** Earliest time a waiting retry becomes runnable, if nothing runs now. */
  wakeAt?: number;
}

const GONE_BAD = new Set(['conflict', 'failed', 'discarded']);

/**
 * Which operations to send next.
 *
 * Mirrors the server's lane rules so a batch is never refused for ordering:
 *  - within a lane, oldest first; an operation still in flight or waiting out
 *    its backoff holds everything behind it (order matters more than speed)
 *  - a lane with a refused or conflicted operation carries on: an unrelated note
 *    after a refused status change should still go
 *  - an operation whose dependency ended badly is failed here, never sent
 *  - a dependency still open elsewhere holds the operation (and its lane)
 */
export function selectBatch(ops: readonly OutboxOp[], now: number, max: number = SYNC_PUSH_MAX_OPS): Selection {
  const byId = new Map(ops.map((o) => [o.id, o]));
  const lanes = new Map<string, OutboxOp[]>();
  for (const op of [...ops].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))) {
    if (op.state === 'done' || op.state === 'discarded') continue;
    const lane = lanes.get(op.lane) ?? [];
    lane.push(op);
    lanes.set(op.lane, lane);
  }

  const batch: OutboxOp[] = [];
  const inBatch = new Set<string>();
  const dependencyFailed: OutboxOp[] = [];
  let wakeAt: number | undefined;

  for (const lane of lanes.values()) {
    for (const op of lane) {
      if (batch.length >= max) break;
      if (op.state === 'conflict' || op.state === 'failed') continue; // does not hold the lane
      if (op.state === 'inflight' || op.state === 'awaiting_auth') break;
      if (op.state === 'retry' && (op.nextAttemptAt ?? 0) > now) {
        wakeAt = Math.min(wakeAt ?? Infinity, op.nextAttemptAt!);
        break;
      }
      const deps = op.dependsOn.map((d) => byId.get(d));
      if (deps.some((d) => d && GONE_BAD.has(d.state))) {
        dependencyFailed.push(op);
        continue;
      }
      // A dependency that is neither done nor already in this batch holds the lane.
      if (deps.some((d) => d && d.state !== 'done' && !inBatch.has(d.id))) break;
      batch.push(op);
      inBatch.add(op.id);
    }
  }
  return { batch, dependencyFailed, wakeAt: batch.length ? undefined : wakeAt };
}
