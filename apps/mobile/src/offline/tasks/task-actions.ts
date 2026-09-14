import type { OccurrenceFix } from '@hbcfield/shared/client';
import { captureEvidence } from '../clock';
import { uuidv7 } from '../ids';
import type { SyncEngine } from '../sync-engine';
import type { OutboxOp } from '../outbox/types';

export type ActionOutcome =
  /** The server accepted it. `response` is its answer. */
  | { kind: 'done'; response: unknown }
  /** The server refused it; the member has been told; nothing changed. */
  | { kind: 'refused'; code?: string; message?: string; conflict: boolean }
  /** Saved on the phone and on its way — the network did not answer in time. */
  | { kind: 'queued' };

/** A settled operation, for a screen. A refusal the screen shows is dismissed from Sync. */
async function outcomeOf(engine: SyncEngine, op: OutboxOp): Promise<ActionOutcome> {
  if (op.state === 'done') return { kind: 'done', response: op.response };
  if (op.state === 'failed' || op.state === 'conflict') {
    // Said on the screen the member is looking at — no need to repeat it in Sync.
    await engine.discard(op.id);
    return { kind: 'refused', code: op.lastError?.code, message: op.lastError?.message, conflict: op.state === 'conflict' };
  }
  return { kind: 'queued' };
}

/**
 * Change a task's status, from wherever the member is.
 *
 * Carries the status they saw (a changed task is refused, not overwritten), the
 * moment of the tap and — for arriving or starting — the GPS fix taken at the
 * tap, so a change synced later is judged by where and when it happened.
 */
export async function changeTaskStatus(
  engine: SyncEngine,
  input: { taskId: string; from: string; to: string; reason?: string; fix?: OccurrenceFix | null },
): Promise<ActionOutcome> {
  const op = await engine.enqueueAndSettle({
    op: 'task.status',
    lane: `task:${input.taskId}`,
    entityId: input.taskId,
    payload: {
      params: { taskId: input.taskId },
      body: {
        status: input.to,
        expectedFrom: input.from,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.fix ? { lat: input.fix.lat, lng: input.fix.lng, accuracy: input.fix.accuracy } : {}),
        evidence: captureEvidence(input.fix),
      },
    },
  });
  return outcomeOf(engine, op);
}

/** Add a note. The phone names it, so a resend can never make a second one. */
export async function addTaskComment(
  engine: SyncEngine,
  input: { taskId: string; content: string },
): Promise<{ id: string; outcome: ActionOutcome }> {
  const id = uuidv7();
  const op = await engine.enqueueAndSettle({
    op: 'task.comment',
    lane: `task:${input.taskId}`,
    entityId: input.taskId,
    payload: { params: { taskId: input.taskId }, body: { id, content: input.content } },
  });
  return { id, outcome: await outcomeOf(engine, op) };
}
