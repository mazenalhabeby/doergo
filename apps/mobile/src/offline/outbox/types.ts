import type { OccurrenceEvidence, SyncOperationName, SyncOperationPayload } from '@hbcfield/shared/client';

/**
 * Where an operation is in its life.
 *
 *   pending ──► inflight ──► done
 *                  │  ├──► retry ──(backoff elapsed)──► inflight
 *                  │  ├──► conflict ──(member: Got it)──► discarded
 *                  │  ├──► failed ───(member: Discard)──► discarded
 *                  │  └──► awaiting_auth ──(same member signs in)──► pending
 *
 *   held ──(nextAttemptAt reached)──► sent like pending
 *     └──(the phone changes its mind first: cancelPending)──► discarded
 *
 * ⚠️ `held` is a step the phone has DECIDED but may still take back — the
 * automatic clock (services/auto-clock): an arrival is filed the moment the
 * member walks in, with that moment as its time, and only sent once they have
 * stayed long enough; walking out again first drops it, never sent. It is
 * durable like everything else here, so a phone that is killed while it waits
 * still sends it on the next wake.
 */
export type OutboxState =
  | 'pending'
  | 'inflight'
  | 'done'
  | 'retry'
  | 'conflict'
  | 'failed'
  | 'awaiting_auth'
  | 'discarded'
  /** Decided, not to be sent before `nextAttemptAt` — and still the phone's to take back. */
  | 'held';

export interface OutboxError {
  code?: string;
  message?: string;
  /** The figures a coded sentence is written with — `distanceMetres`, `radiusMetres` … */
  params?: Record<string, unknown>;
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
export const OPEN_STATES: ReadonlySet<OutboxState> = new Set(['pending', 'inflight', 'retry', 'awaiting_auth', 'held']);
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
