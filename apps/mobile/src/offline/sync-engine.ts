import {
  SYNC_PULL_SCOPES,
  type OccurrenceEvidence,
  type SyncOperationName,
  type SyncOperationPayload,
  type SyncOperationResult,
  type SyncPullResponse,
  type SyncPullScope,
} from '@hbcfield/shared/client';
import { selectBatch } from './outbox/scheduler';
import { applyPushFailure, applyPushResults, failDependency, markInflight, recoverInflight, resumeAuth } from './outbox/transitions';
import { OPEN_STATES, ATTENTION_STATES, type OutboxOp, type OutboxStore } from './outbox/types';

/** How the engine reaches the server. The real one wraps fetchWithAuth; tests pass a fake. */
export interface SyncTransport {
  push(operations: OutboxOp[]): Promise<
    { ok: true; results: SyncOperationResult[] } | { ok: false; status: number | null; code?: string }
  >;
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

type Listener = (snapshot: SyncSnapshot, ops: readonly OutboxOp[]) => void;

/** Finished operations are kept this long so "sent today" can show them. */
const DONE_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * The only part of the app that talks to the network on the offline path.
 *
 * Screens enqueue; the engine decides when to send. One flush at a time; a
 * flush requested while one runs is remembered and run straight after, so a
 * tap during a sync is never lost and never sent twice.
 */
export class SyncEngine {
  private flushing: Promise<void> | null = null;
  private flushAgain = false;
  private pullingNow = false;
  private lastSuccessAt: number | null = null;
  private cache: OutboxOp[] = [];
  private readonly listeners = new Set<Listener>();
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly deps: {
      userId: string;
      organizationId: string;
      store: OutboxStore;
      transport: SyncTransport;
      records: RecordsSink;
      preparer?: OperationPreparer;
      newId: () => string;
      now?: () => number;
      random?: () => number;
    },
  ) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** Load the queue and repair anything a crash left in flight. Call once. */
  async start(): Promise<void> {
    const ops = await this.deps.store.list(this.deps.userId);
    const recovered = recoverInflight(ops, this.now());
    if (recovered.length) await this.deps.store.save(recovered);
    await this.deps.store.prune(this.deps.userId, this.now() - DONE_RETENTION_MS);
    await this.refreshCache();
  }

  stop(): void {
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    this.listeners.clear();
  }

  /**
   * Record an operation. Durable BEFORE it returns — the caller may update the
   * screen immediately and the operation survives the app being killed next.
   */
  async enqueue(input: EnqueueInput): Promise<OutboxOp> {
    const now = this.now();
    const op: OutboxOp = {
      id: this.deps.newId(),
      userId: this.deps.userId,
      organizationId: this.deps.organizationId,
      op: input.op,
      lane: input.lane,
      entityId: input.entityId,
      dependsOn: input.dependsOn ?? [],
      payload: input.payload,
      evidence: input.evidence,
      state: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.store.save([op]);
    await this.refreshCache();
    void this.flush();
    return op;
  }

  /**
   * Enqueue, then wait briefly for the server's answer.
   *
   * Online, a member who taps "Arrived" should hear "you are 340 m from the
   * site" at once, as they always have — not find it in Sync later. So the
   * screen waits up to `timeoutMs` for the operation to settle. Offline, or on a
   * slow line, the wait simply runs out and the operation stays queued: the
   * screen shows it as saved, and the answer arrives whenever it arrives.
   */
  async enqueueAndSettle(input: EnqueueInput, timeoutMs = 8_000): Promise<OutboxOp> {
    const op = await this.enqueue(input);
    const settled = (o: OutboxOp | undefined) => !!o && (o.state === 'done' || o.state === 'failed' || o.state === 'conflict');
    const find = () => this.cache.find((o) => o.id === op.id);
    if (settled(find())) return find()!;
    return new Promise<OutboxOp>((resolve) => {
      let unsubscribe: () => void = () => undefined;
      const timer = setTimeout(() => {
        unsubscribe();
        resolve(find() ?? op);
      }, timeoutMs);
      unsubscribe = this.subscribe(() => {
        const current = find();
        // A transient failure will retry later — waiting longer would only hold the screen.
        if (settled(current) || current?.state === 'retry' || current?.state === 'awaiting_auth') {
          clearTimeout(timer);
          unsubscribe();
          resolve(current!);
        }
      });
    });
  }

  /** Send what can be sent. Safe to call as often as anything likes. */
  flush(): Promise<void> {
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      try {
        do {
          this.flushAgain = false;
          while (await this.pushOnce()) {
            /* keep draining while batches go through */
          }
        } while (this.flushAgain);
      } finally {
        this.flushing = null;
        this.emit();
      }
    })();
    this.emit();
    return this.flushing;
  }

  /** One batch. Returns true when another batch may be ready straight away. */
  private async pushOnce(): Promise<boolean> {
    const ops = await this.deps.store.list(this.deps.userId);
    const now = this.now();
    const { batch, dependencyFailed, wakeAt } = selectBatch(ops, now);
    if (dependencyFailed.length) {
      await this.deps.store.save(failDependency(dependencyFailed, now));
    }
    if (!batch.length) {
      this.scheduleWake(wakeAt);
      await this.refreshCache();
      return dependencyFailed.length > 0;
    }

    await this.deps.store.save(markInflight(batch, now));
    await this.refreshCache();

    const { ready, held } = this.deps.preparer ? await this.prepareBatch(batch) : { ready: batch, held: [] as OutboxOp[] };
    let settled: OutboxOp[] = held;
    if (ready.length) {
      try {
        const res = await this.deps.transport.push(ready);
        settled = settled.concat('results' in res
          ? applyPushResults(ready, res.results, this.now(), this.deps.random)
          : applyPushFailure(ready, res.status, res.code, this.now(), this.deps.random));
      } catch {
        settled = settled.concat(applyPushFailure(ready, null, undefined, this.now(), this.deps.random));
      }
    }
    await this.deps.store.save(settled);
    await this.release(settled.filter((o) => o.state === 'done'));
    const progressed = settled.some((o) => o.state === 'done' || o.state === 'pending');
    if (settled.some((o) => o.state === 'done')) this.lastSuccessAt = this.now();
    await this.refreshCache();
    // Stop on a failure that affects everything (offline, signed out): retrying
    // the next batch immediately would only fail the same way.
    return progressed && !settled.some((o) => o.state === 'awaiting_auth');
  }

  /**
   * Run each operation's preparation (its upload) before the push.
   *
   * ⚠️ AN OPERATION THAT COULD NOT BE PREPARED HOLDS ITS LANE. The notes after a
   * photo in the same lane, and anything depending on it, go back to waiting —
   * sending them without it would deliver the task's story out of order, and
   * the server would never know a photo was missing. A permanent refusal (the
   * member may not add photos here) does not hold, matching the scheduler.
   *
   * A prepared operation is saved before it is sent, so a crash after a
   * 10 MB upload does not upload it again.
   *
   * ⚠️ PREPARING WAITS FOR DEPENDENCIES TO BE ACCEPTED, not merely sent in the
   * same batch. Preparation talks to the server BEFORE the push: a report photo
   * asks for its upload link on a report that, in the same batch, does not
   * exist yet — a 404, and a photo failed for good. It goes in the next push.
   */
  private async prepareBatch(batch: readonly OutboxOp[]): Promise<{ ready: OutboxOp[]; held: OutboxOp[] }> {
    const preparer = this.deps.preparer;
    if (!preparer) return { ready: [...batch], held: [] };
    const ready: OutboxOp[] = [];
    const held: OutboxOp[] = [];
    const blockedLanes = new Set<string>();
    const blockedIds = new Set<string>();
    for (const op of batch) {
      const waitsForBatch = preparer.needsPreparation(op) && op.dependsOn.some((d) => batch.some((b) => b.id === d));
      if (blockedLanes.has(op.lane) || op.dependsOn.some((d) => blockedIds.has(d)) || waitsForBatch) {
        held.push({ ...op, state: 'pending', updatedAt: this.now() });
        blockedLanes.add(op.lane);
        blockedIds.add(op.id);
        continue;
      }
      let result: PrepareResult;
      try {
        result = await preparer.prepare(op);
      } catch {
        result = { ok: false, status: null, code: 'PREPARE_FAILED' };
      }
      // `in`, not `.ok`: the test compiler runs non-strict and does not narrow on a boolean.
      if ('op' in result) {
        if (result.op !== op) await this.deps.store.save([result.op]);
        ready.push(result.op);
        continue;
      }
      if ('hold' in result) {
        held.push({ ...op, state: 'retry', nextAttemptAt: this.now() + result.retryInMs, lastError: { code: result.code }, updatedAt: this.now() });
        blockedIds.add(op.id);
        blockedLanes.add(op.lane);
        continue;
      }
      const [failed] = applyPushFailure([op], result.status, result.code, this.now(), this.deps.random);
      held.push(failed!);
      blockedIds.add(op.id);
      if (failed!.state !== 'failed') blockedLanes.add(op.lane);
    }
    return { ready, held };
  }

  private async release(ops: readonly OutboxOp[]): Promise<void> {
    if (!ops.length || !this.deps.preparer) return;
    await this.deps.preparer.release(ops).catch(() => undefined);
  }

  /**
   * Bring one scope up to date. Rows about which an operation is still waiting
   * are never evicted — the phone would otherwise forget a task while its
   * "arrived" is still on the way.
   */
  async pull(scope: SyncPullScope): Promise<void> {
    const keep = new Set(this.cache.filter((o) => OPEN_STATES.has(o.state) && o.entityId).map((o) => o.entityId!));
    let { cursor } = await this.deps.records.cursor(scope);
    let firstPage = true;
    this.pullingNow = true;
    this.emit();
    try {
      for (let page = 0; page < 100; page++) {
        const res = await this.deps.transport.pull(scope, cursor);
        await this.deps.records.applyPull(scope, res, { keep, firstPage });
        firstPage = false;
        cursor = res.cursor;
        if (!res.hasMore) break;
      }
      this.lastSuccessAt = this.now();
    } finally {
      this.pullingNow = false;
      this.emit();
    }
  }

  /** Push, then pull every scope. What pull-to-refresh and reconnecting do. */
  async syncAll(): Promise<void> {
    await this.flush();
    for (const scope of SYNC_PULL_SCOPES) {
      await this.pull(scope).catch(() => undefined);
    }
  }

  /** The member signed in again: resume what waited for them. */
  async resumeAfterSignIn(): Promise<void> {
    const ops = await this.deps.store.list(this.deps.userId);
    const resumed = resumeAuth(ops, this.now());
    if (resumed.length) await this.deps.store.save(resumed);
    await this.refreshCache();
    void this.flush();
  }

  /** "Got it" on a conflict, or "Discard" on a failure. */
  async discard(id: string): Promise<void> {
    const op = await this.deps.store.get(id);
    if (!op || !ATTENTION_STATES.has(op.state)) return;
    const discarded: OutboxOp = { ...op, state: 'discarded', updatedAt: this.now() };
    await this.deps.store.save([discarded]);
    await this.release([discarded]);
    await this.refreshCache();
  }

  /** Try a failed operation again (e.g. after the member fixed what was wrong). */
  async retry(id: string): Promise<void> {
    const op = await this.deps.store.get(id);
    if (!op || op.state !== 'failed') return;
    await this.deps.store.save([{ ...op, state: 'pending', lastError: undefined, updatedAt: this.now() }]);
    await this.refreshCache();
    void this.flush();
  }

  snapshot(): SyncSnapshot {
    return {
      waiting: this.cache.filter((o) => OPEN_STATES.has(o.state)).length,
      attention: this.cache.filter((o) => ATTENTION_STATES.has(o.state)).length,
      pushing: this.flushing !== null,
      pulling: this.pullingNow,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  operations(): readonly OutboxOp[] {
    return this.cache;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Everything still unsent — the sign-out guard asks this. */
  hasUnsent(): boolean {
    return this.cache.some((o) => OPEN_STATES.has(o.state) || ATTENTION_STATES.has(o.state));
  }

  private scheduleWake(at: number | undefined): void {
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    if (at === undefined) return;
    this.wakeTimer = setTimeout(() => void this.flush(), Math.max(0, at - this.now()));
    // A pending retry must never be what keeps a process alive (tests, headless tasks).
    (this.wakeTimer as { unref?: () => void }).unref?.();
  }

  private async refreshCache(): Promise<void> {
    this.cache = await this.deps.store.list(this.deps.userId);
    this.emit();
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap, this.cache);
  }
}
