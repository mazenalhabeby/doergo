import { findLogType, normalizeKindShape } from '@hbcfield/shared/client';
import type { HeldAsset, MyLogEntry } from '../../lib/api/assets';
import { STILL_MINE } from '../actions/outcome';
import type { OutboxOp } from '../outbox/types';

/** A row of "My entries" — the server's, or one this phone has not delivered yet. */
export type MyLogRow = MyLogEntry & { pendingSync?: boolean };

type LogBody = {
  entryId?: string;
  logType?: string;
  values?: Record<string, string | number>;
  note?: string;
  occurredAt?: string;
  receiptPending?: boolean;
  receiptKey?: string;
};

const LOG_CREATE = 'log.create';

/** What the server answered for a delivered entry, when it said. Tolerates the `success()` wrapper. */
function answeredStatus(response: unknown): MyLogEntry['status'] | null {
  const r = response as { status?: unknown; data?: { status?: unknown } } | null | undefined;
  const s = r?.data?.status ?? r?.status;
  return s === 'SUBMITTED' || s === 'RECORDED' || s === 'REJECTED' ? s : null;
}

/**
 * One queued entry, shaped like the server's row so "My entries" draws it with
 * the same component.
 *
 * The heading, the amount and its direction are read off the KIND the member
 * holds, exactly as the server will: a Fuel entry says "Fuel · €62.40" while it
 * waits, not a key and a zero.
 */
function rowFromOp(op: OutboxOp, held: readonly HeldAsset[], pending: boolean): MyLogRow {
  const body = (op.payload.body ?? {}) as LogBody;
  const params = (op.payload.params ?? {}) as { assetId?: string };
  const assetId = params.assetId ?? op.entityId ?? '';
  const holding = held.find((h) => h.assetId === assetId);
  const type = holding ? findLogType(normalizeKindShape(holding.asset?.category?.config), body.logType ?? '') : null;
  const values = body.values ?? {};
  const money = type?.fields.find((f) => f.type === 'money');
  const cents = money ? values[money.key] : undefined;

  return {
    // The id the PHONE made — the server files the entry under it, which is
    // what lets the delivered row replace this one instead of sitting beside it.
    id: body.entryId ?? op.id,
    assetId,
    logType: body.logType ?? '',
    category: type?.label ?? body.logType ?? '',
    direction: money?.direction === 'in' ? 'IN' : 'OUT',
    amountCents: typeof cents === 'number' && Number.isFinite(cents) ? Math.abs(Math.round(cents)) : 0,
    note: body.note ?? null,
    values,
    occurredAt: body.occurredAt ?? new Date(op.createdAt).toISOString(),
    // Until the server says otherwise, what it WILL say: a type that needs
    // approval waits for the office; the member cannot know whether they
    // manage assets in the server's eyes, and "waiting" is the modest guess.
    status: answeredStatus(op.response) ?? (type?.needsApproval ? 'SUBMITTED' : 'RECORDED'),
    reviewNote: null,
    reviewedAt: null,
    hasReceipt: !!(body.receiptPending || body.receiptKey),
    asset: holding?.asset ? { id: holding.asset.id, name: holding.asset.name } : null,
    pendingSync: pending,
  };
}

/**
 * "My entries" as the member sees it: the server's list with their own entries
 * the server has not listed yet laid on top.
 *
 * Computed on every read and never stored, like the task and shift overlays —
 * a refused entry disappears the moment it is refused (conflict and failure are
 * the Sync screen's to explain), and nothing on the phone ever overwrites the
 * server's copy with a guess.
 *
 * ⚠️ An entry the server accepted AFTER `serverAt` still shows: between "sent"
 * and the next refresh the cached list is older than the delivery, and dropping
 * it would make an entry vanish for the seconds in between — the exact moment
 * somebody is looking to see that it went.
 *
 * ⚠️ Matched on the id the phone generated. The server files the entry under
 * `entryId`, so once the list has it the queued row is simply not added — one
 * row, never two.
 *
 * @param server  the server's list, or null when there is none (an older
 *                deploy, or no signal and nothing kept). Queued entries are
 *                still shown then: somebody who logged fuel with no signal
 *                must see it was saved.
 */
export function overlayMyLog(
  server: readonly MyLogEntry[] | null,
  ops: readonly OutboxOp[],
  held: readonly HeldAsset[],
  serverAt: number,
): MyLogRow[] | null {
  const known = new Set((server ?? []).map((e) => e.id));
  const mine = ops
    .filter((o) => o.op === LOG_CREATE && (STILL_MINE.has(o.state) || (o.state === 'done' && o.updatedAt > serverAt)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((o) => rowFromOp(o, held, STILL_MINE.has(o.state)))
    .filter((row) => !known.has(row.id));

  if (!server) return mine.length ? mine : null;
  // Newest first, and what was just done at the top: it is what somebody opened the screen to check.
  return [...mine, ...server];
}

/**
 * How many entries have been delivered since the list was read — the screen
 * re-reads when this moves, so a queued row turns into the server's own (with
 * its real status) without anybody pulling to refresh.
 */
export function logEntriesDeliveredSince(ops: readonly OutboxOp[], serverAt: number): number {
  let n = 0;
  for (const o of ops) if (o.op === LOG_CREATE && o.state === 'done' && o.updatedAt > serverAt) n++;
  return n;
}
