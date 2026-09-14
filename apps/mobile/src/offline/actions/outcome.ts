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
export async function outcomeOf(engine: SyncEngine, op: OutboxOp): Promise<ActionOutcome> {
  if (op.state === 'done') return { kind: 'done', response: op.response };
  if (op.state === 'failed' || op.state === 'conflict') {
    // Said on the screen the member is looking at — no need to repeat it in Sync.
    await engine.discard(op.id);
    return { kind: 'refused', code: op.lastError?.code, message: op.lastError?.message, conflict: op.state === 'conflict' };
  }
  return { kind: 'queued' };
}

/** States in which a queued change still counts for what the member sees. */
export const STILL_MINE: ReadonlySet<string> = new Set(['pending', 'inflight', 'retry', 'awaiting_auth']);
