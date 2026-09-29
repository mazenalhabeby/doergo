import type { MyExpense, MyLogEntry, MyProposal } from './api/assets';

/**
 * EVERYTHING A MEMBER SENT IN ABOUT THEIR EQUIPMENT — one list, one set of words.
 *
 * It used to be three lists with four words for two states: an entry was
 * "Recorded" and a receipt "Accepted"; pending was "Waiting" in one and
 * "Waiting for the office" in the other. And a receipt or a contract saved with
 * no signal was invisible until it had gone — only logbook entries were laid
 * over the server's list.
 *
 *   toSend    on this phone, not yet sent
 *   office    sent, the office has not decided
 *   accepted  counts now
 *   refused   the office said no (with its reason)
 *   takenBack the member withdrew it
 */
export type SentState = 'toSend' | 'office' | 'accepted' | 'refused' | 'takenBack';

export interface SentItem {
  key: string;
  kind: 'entry' | 'receipt' | 'contract';
  /** The server's id — what "take back" addresses. Absent while it is still on the phone. */
  id: string | null;
  assetId: string | null;
  /** An entry's type key, or a receipt's category. */
  what: string;
  /** The thing it is about: an asset's name, or what the contract named. */
  about: string | null;
  at: string;
  amountCents: number;
  direction: 'IN' | 'OUT';
  state: SentState;
  reason: string | null;
  /** A reading the entry carried — "48 210 km". */
  reading: string | null;
}

/** A queued write, as the outbox holds it — only what this list reads. */
export interface QueuedSend {
  id: string;
  op: string;
  createdAt: number;
  body: Record<string, unknown>;
  params?: Record<string, unknown>;
}

const STATE: Record<string, SentState> = { SUBMITTED: 'office', RECORDED: 'accepted', REJECTED: 'refused' };

/**
 * The reading an entry carries — "48 210 km". Only a field the kind gives a UNIT
 * counts: the first bare number could as well be a price or a count of litres.
 */
function readingOf(values: Record<string, string | number> | null | undefined, unitOf?: (field: string) => string | null): string | null {
  if (!values) return null;
  for (const [k, v] of Object.entries(values)) {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || String(v).trim() === '') continue;
    const unit = unitOf?.(k);
    if (unit) return `${n.toLocaleString()} ${unit}`;
  }
  return null;
}

/** What a contract names, for the row's title. */
export function contractName(f: MyProposal['fields'] | Record<string, unknown> | null | undefined): string | null {
  const x = (f ?? {}) as Record<string, string | undefined>;
  return x.name || x.registration || x.serial || [x.manufacturer, x.model].filter(Boolean).join(' ') || null;
}

export function sentIn(input: {
  /** Log entries — the server's plus the queued overlay. Null on a server without the logbook. */
  entries: readonly (MyLogEntry & { pendingSync?: boolean })[] | null;
  /** Receipts on a server without the logbook. */
  expenses: readonly MyExpense[];
  proposals: readonly MyProposal[];
  queued: readonly QueuedSend[];
  nameOf: (assetId: string) => string | null;
  unitOf?: (assetId: string, logType: string, field: string) => string | null;
}): SentItem[] {
  const out: SentItem[] = [];

  if (input.entries) {
    for (const e of input.entries) {
      out.push({
        key: `e:${e.id}`, kind: 'entry', id: e.pendingSync ? null : e.id, assetId: e.assetId,
        what: e.logType || e.category, about: e.asset?.name ?? input.nameOf(e.assetId),
        at: e.occurredAt, amountCents: e.amountCents, direction: e.direction,
        state: e.pendingSync ? 'toSend' : STATE[e.status] ?? 'office', reason: e.reviewNote?.trim() || null,
        reading: readingOf(e.values, input.unitOf ? (f) => input.unitOf!(e.assetId, e.logType, f) : undefined),
      });
    }
  } else {
    for (const x of input.expenses) {
      out.push({
        key: `x:${x.id}`, kind: 'receipt', id: x.id, assetId: x.assetId, what: x.category,
        about: x.asset?.name ?? input.nameOf(x.assetId), at: x.occurredAt, amountCents: x.amountCents,
        direction: x.direction, state: STATE[x.status] ?? 'office', reason: x.reviewNote?.trim() || null, reading: null,
      });
    }
  }

  for (const p of input.proposals) {
    out.push({
      key: `p:${p.id}`, kind: 'contract', id: p.id, assetId: null, what: 'contract', about: contractName(p.fields),
      at: p.createdAt, amountCents: 0, direction: 'OUT',
      state: p.status === 'PENDING' ? 'office' : p.status === 'ACCEPTED' ? 'accepted' : p.status === 'REJECTED' ? 'refused' : 'takenBack',
      reason: p.reviewNote?.trim() || null, reading: null,
    });
  }

  /* Receipts and contracts still on the phone — entries are already in `entries` through the overlay. */
  for (const q of input.queued) {
    if (q.op === 'expense.submit') {
      const assetId = String(q.params?.assetId ?? '');
      out.push({
        key: `q:${q.id}`, kind: 'receipt', id: null, assetId, what: String(q.body.category ?? ''),
        about: input.nameOf(assetId), at: String(q.body.occurredAt ?? new Date(q.createdAt).toISOString()),
        amountCents: Number(q.body.amountCents ?? 0), direction: 'OUT', state: 'toSend', reason: null, reading: null,
      });
    } else if (q.op === 'proposal.raise') {
      out.push({
        key: `q:${q.id}`, kind: 'contract', id: null, assetId: null, what: 'contract',
        about: contractName(q.body.fields as Record<string, unknown>), at: new Date(q.createdAt).toISOString(),
        amountCents: 0, direction: 'OUT', state: 'toSend', reason: null, reading: null,
      });
    }
  }

  /* What is still on the phone first, then newest first. */
  return out.sort((a, b) => Number(b.state === 'toSend') - Number(a.state === 'toSend') || Date.parse(b.at) - Date.parse(a.at));
}

/**
 * Only something the office has not decided, and that has reached the server,
 * can be taken back — a logbook entry or a contract page. A receipt from a
 * server without the logbook had no way back, and still has none.
 */
export const canTakeBack = (i: SentItem) => i.state === 'office' && !!i.id && i.kind !== 'receipt';
