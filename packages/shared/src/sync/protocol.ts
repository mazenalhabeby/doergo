/**
 * The sync wire protocol, shared by the phone's sync engine and the gateway.
 *
 * A phone pushes an ordered batch of operations it recorded (online or not) and
 * gets one result per operation. It pulls, per scope, what changed since its
 * cursor. Both directions are idempotent: an operation's `id` IS its
 * Idempotency-Key, and the server gives the same answer however many times the
 * same operation arrives.
 */
import type { OccurrenceEvidence } from './occurrence';

/**
 * How long a deletion is remembered for offline phones.
 *
 * A phone whose pull cursor is older than this may have missed a deletion, so
 * the server answers `reset: true` and the phone rebuilds that scope from
 * scratch instead of trusting its copy.
 */
/**
 * How one phone's queue is doing, sent now and then. Counts and ages only —
 * never what the work is.
 */
export interface SyncTelemetry {
  appVersion: string;
  /** Operations still needing the network. */
  waiting: number;
  /** Operations the member has to look at. */
  attention: number;
  /** When the oldest waiting operation was made (epoch ms), if any. */
  oldestWaitingAt: number | null;
  /** Operations by state. */
  byState: Record<string, number>;
  /** Why operations are failing or waiting, by code. */
  codes: Record<string, number>;
  /** Photos and documents waiting to upload. */
  filesWaiting: number;
  bytesWaiting: number;
  /** Last successful push or pull (epoch ms). */
  lastSuccessAt: number | null;
}

/** Most attachment ids one media-links request may ask to sign. */
export const SYNC_MEDIA_LINKS_MAX = 100;

/** A short-lived link to one photo the member may see, for the phone's offline image cache. */
export interface SyncMediaLink {
  id: string;
  url: string;
  mimeType: string | null;
}

export const SYNC_TOMBSTONE_RETENTION_DAYS = 90;

/** At most this many operations per push. More are sent in further batches. */
export const SYNC_PUSH_MAX_OPS = 50;

export interface SyncOperation<P = unknown> {
  /** UUIDv7 made on the phone. Doubles as the Idempotency-Key. */
  id: string;
  /** What to do, e.g. `task.comment`, `attendance.clockIn`. */
  op: string;
  /**
   * Operations in one lane run strictly in order; lanes run independently.
   * `task:<id>`, `shift:<entryId>`, `chat:<conversationId>`.
   */
  lane: string;
  /** Operations that must have succeeded first (ids in this or an earlier push). */
  dependsOn?: string[];
  payload: P;
  evidence?: OccurrenceEvidence;
}

export type SyncOperationStatus =
  /** Applied now. */
  | 'applied'
  /** Already applied by an earlier attempt; this is the same answer. */
  | 'replayed'
  /** The server's state moved on (reassigned, cancelled, already moved). `current` says to what. */
  | 'conflict'
  /** Refused and will be refused again — surfaced to the member. */
  | 'rejected'
  /** Not attempted or failed transiently — try again later. */
  | 'retry'
  /** A dependency was not applied, so this was not attempted. */
  | 'skipped';

export interface SyncOperationResult {
  id: string;
  status: SyncOperationStatus;
  /** Machine-readable reason (e.g. TASK_REASSIGNED) for the member's language. */
  code?: string;
  message?: string;
  /** The server's answer for an applied/replayed operation. */
  body?: unknown;
  /** The server's current version of the entity, on a conflict. */
  current?: unknown;
}

export interface SyncPushRequest {
  operations: SyncOperation[];
}

export interface SyncPushResponse {
  results: SyncOperationResult[];
  serverTime: string;
}

/**
 * What the outbox does with an HTTP answer to one operation.
 *
 * One table instead of a guess per screen:
 *   2xx                    → done
 *   401                    → awaiting_auth (pause the whole queue, keep it)
 *   409 IDEMPOTENCY_IN_PROGRESS, 408, 425, 429, 5xx, network → retry with backoff
 *   409 otherwise          → conflict
 *   other 4xx              → failed (show it; never retry forever)
 */
export type OutboxOutcome = 'done' | 'retry' | 'awaiting_auth' | 'conflict' | 'failed';

export function outboxOutcomeFor(httpStatus: number | null | undefined, code?: string): OutboxOutcome {
  if (httpStatus === null || httpStatus === undefined || httpStatus === 0) return 'retry';
  if (httpStatus >= 200 && httpStatus < 300) return 'done';
  if (httpStatus === 401) return 'awaiting_auth';
  if (httpStatus === 409 && code === 'IDEMPOTENCY_IN_PROGRESS') return 'retry';
  if (httpStatus === 408 || httpStatus === 425 || httpStatus === 429 || httpStatus >= 500) return 'retry';
  if (httpStatus === 409) return 'conflict';
  return 'failed';
}

/** Same mapping for a result inside a push response. */
export function outboxOutcomeForResult(result: Pick<SyncOperationResult, 'status' | 'code'>): OutboxOutcome {
  switch (result.status) {
    case 'applied':
    case 'replayed':
      return 'done';
    case 'conflict':
      return 'conflict';
    case 'rejected':
    case 'skipped':
      return 'failed';
    default:
      return 'retry';
  }
}

/**
 * Wait before retry N (1-based): 2 s, 4 s, 8 s … capped at 5 minutes, ±20 %.
 * Jitter keeps a fleet of phones that regained signal at the same moment (a van
 * leaving a tunnel) from retrying in lockstep.
 */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(2000 * 2 ** Math.max(0, attempt - 1), 5 * 60 * 1000);
  return Math.round(base * (0.8 + random() * 0.4));
}

/** The parts of a member's world a phone keeps a copy of. Grows phase by phase. */
export const SYNC_PULL_SCOPES = ['spaces', 'workflows', 'tasks', 'comments', 'attachments'] as const;
export type SyncPullScope = (typeof SYNC_PULL_SCOPES)[number];

/** At most this many rows per pull page. */
export const SYNC_PULL_MAX_ROWS = 200;

export interface SyncPullResponse<Row = unknown> {
  scope: SyncPullScope;
  /** Rows created or changed since the cursor, oldest change first. */
  rows: Row[];
  /** Ids deleted since the cursor. */
  deleted: string[];
  /**
   * Every id currently in scope, on the LAST page of a pull. A local row not in
   * this list left the member's scope (reassigned, closed long ago) and is
   * removed — unless an operation about it is still waiting to be sent.
   */
  scopeIds?: string[];
  /** Pass back as `cursor` next time. */
  cursor: string;
  /** More pages follow immediately. */
  hasMore: boolean;
  /**
   * The phone's copy cannot be trusted (cursor older than the tombstone
   * window, or this scope is always sent whole): replace the scope with `rows`.
   */
  reset: boolean;
  serverTime: string;
}
