import { useEffect, useMemo, useRef } from 'react';
import type { SyncOperationName } from '@hbcfield/shared/client';
import { uuidv7 } from '../ids';
import { useOffline, useSyncStatus } from '../offline-context';
import type { OutboxOp } from '../outbox/types';
import type { SyncEngine } from '../sync-engine';
import { outcomeOf, STILL_MINE, type ActionOutcome } from './outcome';

export interface CreateInput {
  op: SyncOperationName;
  lane: string;
  entityId?: string;
  params?: Record<string, string>;
  body: Record<string, unknown>;
  /**
   * The field the route reads the phone's id from. `id` unless the route
   * already uses it for something else; `null` for an action that creates
   * nothing (an answer, an approval) — the outbox's idempotency key alone
   * makes its resend safe.
   */
  idField?: string | null;
  dependsOn?: string[];
  /** The id, when the caller needs it before creating (to queue what follows). Made here otherwise. */
  id?: string;
}

/**
 * Create something from the phone — a time-off request, a message, a report of
 * a problem — with or without signal.
 *
 * The phone names it (UUIDv7), the outbox sends it, and the server returns the
 * same record however many times it arrives. One implementation for every
 * "create" a worker makes; the screens differ only in what they show meanwhile.
 */
export async function createFromPhone(engine: SyncEngine, input: CreateInput): Promise<{ id: string; opId: string; state: OutboxOp['state']; outcome: ActionOutcome }> {
  const id = input.id ?? uuidv7();
  const op = await engine.enqueueAndSettle({
    op: input.op,
    lane: input.lane,
    entityId: input.entityId,
    dependsOn: input.dependsOn,
    payload: {
      ...(input.params ? { params: input.params } : {}),
      body: input.idField === null ? input.body : { ...input.body, [input.idField ?? 'id']: id },
    },
  });
  return { id, opId: op.id, state: op.state, outcome: await outcomeOf(engine, op) };
}

/** What a create is still waiting to send, for a screen to show in place. */
export interface PendingCreate<B> {
  id: string;
  body: B;
  params: Record<string, string>;
  createdAt: number;
}

export function pendingCreates<B>(
  ops: readonly OutboxOp[],
  op: SyncOperationName,
  match: (o: OutboxOp) => boolean = () => true,
  idField = 'id',
): PendingCreate<B>[] {
  return ops
    .filter((o) => o.op === op && STILL_MINE.has(o.state) && match(o))
    .map((o) => {
      const body = (o.payload.body ?? {}) as Record<string, unknown>;
      return { id: String(body[idField]), body: body as B, params: o.payload.params ?? {}, createdAt: o.createdAt };
    });
}

/**
 * The create action for a screen, and what it is still waiting to send.
 *
 * On a build without the offline layer `run` calls `direct` — the API call the
 * screen always made — so a screen needs one code path, not two.
 */
export function useQueuedCreate<B>(op: SyncOperationName, options: { match?: (o: OutboxOp) => boolean; idField?: string | null; onAccepted?: () => void } = {}) {
  const { engine } = useOffline();
  const { operations } = useSyncStatus();

  const pending = useMemo(
    () => pendingCreates<B>(operations, op, options.match, options.idField ?? 'id'),
    // `match` is expected to be stable for a screen; including it would re-filter on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [operations, op, options.idField],
  );

  // One accepted in the background: the screen reloads to show the server's copy.
  const seen = useRef(new Set<string>());
  const onAccepted = useRef(options.onAccepted);
  onAccepted.current = options.onAccepted;
  useEffect(() => {
    let fresh = false;
    for (const o of operations) {
      if (o.op !== op || o.state !== 'done' || seen.current.has(o.id)) continue;
      seen.current.add(o.id);
      fresh = true;
    }
    if (fresh) onAccepted.current?.();
  }, [operations, op]);

  const run = async (input: Omit<CreateInput, 'op'>, direct: () => Promise<unknown>): Promise<ActionOutcome> => {
    if (!engine) return { kind: 'done', response: await direct() };
    return (await createFromPhone(engine, { idField: options.idField, ...input, op })).outcome;
  };

  return { run, pending };
}
