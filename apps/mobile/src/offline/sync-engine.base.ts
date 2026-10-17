import { type SyncPullScope } from '@hbcfield/shared/client';
import { applyPushFailure } from './outbox/transitions';
import { OPEN_STATES, ATTENTION_STATES, type OutboxOp, type OutboxStore } from './outbox/types';
import {
  type SyncTransport,
  type RecordsSink,
  type PrepareResult,
  type OperationPreparer,
  type SyncSnapshot,
  type Listener,
} from './sync-engine-types';

/**
 * The engine's state, its queue cache and its pulls — the part every operation reads.
 * — moved here unchanged from sync-engine.ts; `SyncEngine` extends it.
 */
export abstract class SyncEngineBase {
  protected flushing: Promise<void> | null = null;
  protected flushAgain = false;
  protected pullingNow = false;
  /** The pull of each scope that is on its way — see `pull`. */
  protected readonly pulls = new Map<SyncPullScope, Promise<void>>();
  protected lastSuccessAt: number | null = null;
  protected cache: OutboxOp[] = [];
  protected readonly listeners = new Set<Listener>();
  protected wakeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Stopped for good (sign-out): no new push or pull may touch the database. */
  protected stopped = false;

  constructor(
    protected readonly deps: {
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

  protected now(): number {
    return this.deps.now?.() ?? Date.now();
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
  protected async prepareBatch(batch: readonly OutboxOp[]): Promise<{ ready: OutboxOp[]; held: OutboxOp[] }> {
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
        held.push({
          ...op,
          state: 'retry',
          nextAttemptAt: this.now() + result.retryInMs,
          lastError: { code: result.code },
          updatedAt: this.now(),
        });
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

  protected async release(ops: readonly OutboxOp[]): Promise<void> {
    if (!ops.length || !this.deps.preparer) return;
    await this.deps.preparer.release(ops).catch(() => undefined);
  }

  /**
   * Bring one scope up to date. Rows about which an operation is still waiting
   * are never evicted — the phone would otherwise forget a task while its
   * "arrived" is still on the way.
   */
  pull(scope: SyncPullScope): Promise<void> {
    /*
      ⚠️ ONE PULL PER SCOPE AT A TIME — a second caller joins the first.

      Reconnecting runs `syncAll`, the home's two task readers each pull on the
      same focus, and a socket poke can land in the middle: three pulls of one
      scope with one cursor, each applying the same pages in its own
      transaction and each announcing a change that re-reads every screen. The
      answer the late callers want is the one already on its way.
    */
    const running = this.pulls.get(scope);
    if (running) return running;
    if (this.stopped) return Promise.resolve();
    const started = this.pullScope(scope).finally(() => this.pulls.delete(scope));
    this.pulls.set(scope, started);
    return started;
  }

  protected async pullScope(scope: SyncPullScope): Promise<void> {
    const keep = new Set(this.cache.filter((o) => OPEN_STATES.has(o.state) && o.entityId).map((o) => o.entityId!));
    let { cursor } = await this.deps.records.cursor(scope);
    let firstPage = true;
    this.pullingNow = true;
    this.emit();
    try {
      for (let page = 0; page < 100; page++) {
        if (this.stopped) break;
        const res = await this.deps.transport.pull(scope, cursor);
        if (this.stopped) break;
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

  protected async refreshCache(): Promise<void> {
    this.cache = await this.deps.store.list(this.deps.userId);
    this.emit();
  }

  protected emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap, this.cache);
  }
}
