import {
  type OccurrenceEvidence,
  type SyncOperationName,
  type SyncOperationPayload,
  type SyncOperationResult,
  type SyncPullResponse,
  type SyncPullScope,
} from '@hbcfield/shared/client';
import { type OutboxOp } from './outbox/types';

/** The engine's contracts (transport, records, preparer) and the snapshot it reports — moved here unchanged from sync-engine.ts. */
/** How the engine reaches the server. The real one is the API client (http-transport.ts); tests pass a fake. */
export interface SyncTransport {
  push(
    operations: OutboxOp[],
  ): Promise<{ ok: true; results: SyncOperationResult[] } | { ok: false; status: number | null; code?: string }>;
  pull(scope: SyncPullScope, cursor: string | null): Promise<SyncPullResponse>;
}

/** Where pulled rows go. RecordsStore on a phone. */
export interface RecordsSink {
  applyPull(
    scope: string,
    page: SyncPullResponse,
    options: { keep?: ReadonlySet<string>; firstPage: boolean },
  ): Promise<void>;
  cursor(scope: string): Promise<{ cursor: string | null; lastPullAt: number | null }>;
}

/** What preparing an operation came to. A failure is classified like an HTTP answer. */
export type PrepareResult =
  | { ok: true; op: OutboxOp }
  | { ok: false; status: number | null; code?: string }
  /** Not now, and not a failure: waiting for something (Wi-Fi). No attempt is counted. */
  | { ok: false; hold: true; code: string; retryInMs: number };

/**
 * Work an operation needs done before it can be sent — uploading its photo.
 *
 * The engine knows nothing about files: it asks the preparer before sending and
 * tells it when an operation is finished with, so the photo is kept exactly as
 * long as the operation that needs it.
 */
export interface OperationPreparer {
  /** Whether this operation has preparation work (which may call the server). */
  needsPreparation(op: OutboxOp): boolean;
  prepare(op: OutboxOp): Promise<PrepareResult>;
  /** Operations that are done or discarded — their local leftovers can go. */
  release(ops: readonly OutboxOp[]): Promise<void>;
}

export interface EnqueueInput {
  op: SyncOperationName;
  lane: string;
  entityId?: string;
  dependsOn?: string[];
  payload: SyncOperationPayload;
  evidence?: OccurrenceEvidence;
  /**
   * Not to be sent before this moment (epoch ms) — and until then the phone may
   * still take it back with `cancelPending`. The automatic clock's arrival
   * waiting out its dwell; see `held` in outbox/types.ts.
   */
  holdUntil?: number;
}

export interface SyncSnapshot {
  /** Operations still needing the network. */
  waiting: number;
  /** Operations a member has to look at. */
  attention: number;
  pushing: boolean;
  pulling: boolean;
  lastSuccessAt: number | null;
}

export type Listener = (snapshot: SyncSnapshot, ops: readonly OutboxOp[]) => void;

/** Finished operations are kept this long so "sent today" can show them. */
export const DONE_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Failures in which the request never completed — see `cancelPending`.
 *
 * `NETWORK` is what `applyPushFailure` records when the transport itself threw
 * or answered with no status; `UNREACHABLE` is the same thing said by the
 * server-side replay when it could not reach a route.
 */
export const NEVER_REACHED_SERVER: ReadonlySet<string> = new Set(['NETWORK', 'UNREACHABLE']);
