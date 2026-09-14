import type { OccurrenceEvidence, SyncOperationName, SyncOperationPayload } from '@hbcfield/shared/client';

/**
 * Where an operation is in its life.
 *
 *   pending ──► inflight ──► done
 *                  │  ├──► retry ──(backoff elapsed)──► inflight
 *                  │  ├──► conflict ──(member: Got it)──► discarded
 *                  │  ├──► failed ───(member: Discard)──► discarded
 *                  │  └──► awaiting_auth ──(same member signs in)──► pending
 */
export type OutboxState =
  | 'pending'
  | 'inflight'
  | 'done'
  | 'retry'
  | 'conflict'
  | 'failed'
  | 'awaiting_auth'
  | 'discarded';

export interface OutboxError {
  code?: string;
  message?: string;
}

export interface OutboxOp {
  /** UUIDv7; the Idempotency-Key. */
  id: string;
  userId: string;
  organizationId: string;
  op: SyncOperationName;
  /** `task:<id>`, `shift:<entryId>` … — order is kept within a lane. */
  lane: string;
  /** The record this is about, for "waiting to send" chips. */
  entityId?: string;
  dependsOn: string[];
  payload: SyncOperationPayload;
  evidence?: OccurrenceEvidence;
  state: OutboxState;
  attempts: number;
  /** Epoch ms before which a retry is not attempted. */
  nextAttemptAt?: number;
  lastError?: OutboxError;
  /** The server's answer (done) or its current state (conflict). */
  response?: unknown;
  createdAt: number;
  updatedAt: number;
}

/** States that still need the network. */
export const OPEN_STATES: ReadonlySet<OutboxState> = new Set(['pending', 'inflight', 'retry', 'awaiting_auth']);
/** States a member has to look at. */
export const ATTENTION_STATES: ReadonlySet<OutboxState> = new Set(['conflict', 'failed']);

/**
 * Persistence for the outbox. SQLite on a phone, memory in tests — the engine
 * depends on this interface and nothing else.
 */
export interface OutboxStore {
  list(userId: string): Promise<OutboxOp[]>;
  get(id: string): Promise<OutboxOp | null>;
  /** Insert or replace, atomically for the whole set. */
  save(ops: OutboxOp[]): Promise<void>;
  /** Remove finished operations older than `before` (epoch ms). */
  prune(userId: string, before: number): Promise<number>;
}
