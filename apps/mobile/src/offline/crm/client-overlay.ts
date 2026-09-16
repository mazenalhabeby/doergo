import { STILL_MINE } from '../actions/outcome';
import type { OutboxOp } from '../outbox/types';
import type { MobileCustomer } from '../../lib/api';
import type { MobileCustomerContact } from '../../lib/api/customers';

/*
  THE RECORD AS THE MEMBER LAST LEFT IT.

  A queued change is not "optimistic state" living in a component — it is a fact
  in the outbox, and reading the screen off the outbox is what makes it survive
  walking to the next screen and back, or the app being killed on the way to the
  van. It also rolls back by itself: a refusal discards the operation, and the
  overlay it was contributing simply stops existing.

  ⚠️ IDENTITY IS PRESERVED WHERE NOTHING IS PENDING. `operations` changes
  whenever anything anywhere in the outbox moves — a clock-in, a photo — and
  these helpers are read inside the record screen's memos, above two memoised
  lists. Returning a fresh object every time would re-render every row of a
  two-hundred-entry feed because somebody started a rest break. So each helper
  returns the very array or object it was given when it has nothing to say.
*/

/** A body key only the phone reads; see http-transport, which strips them. */
type AddBody = {
  personId?: string;
  role?: string;
  isPrimary?: boolean;
  $name?: string;
  $shownId?: string;
};

const open = (o: OutboxOp) => STILL_MINE.has(o.state);

/** The client with every queued change to it applied, oldest first. */
export type PendingCustomer = MobileCustomer & { pendingSync?: boolean };

/**
 * The fields still waiting to reach the server for this client, merged.
 *
 * Merged the way the server would apply them: in the order they were made, so
 * the newest value of each field wins. Null when nothing is waiting — which is
 * the caller's cue to keep the record object it already had.
 */
export function pendingClientPatch(
  ops: readonly OutboxOp[],
  customerId: string,
): Record<string, unknown> | null {
  const mine = ops
    .filter((o) => o.op === 'customer.update' && open(o) && o.payload.params?.customerId === customerId)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (!mine.length) return null;
  return Object.assign({}, ...mine.map((o) => (o.payload.body ?? {}) as Record<string, unknown>));
}

export function applyPendingClient(customer: PendingCustomer, ops: readonly OutboxOp[]): PendingCustomer {
  const patch = pendingClientPatch(ops, customer.id);
  return patch ? { ...customer, ...patch, pendingSync: true } : customer;
}

/** A contact link the member has attached but the server has not minted yet. */
export type PendingContactLink = MobileCustomerContact & {
  /** The outbox operation — what "remove" cancels, since there is no link to delete. */
  opId: string;
  waiting: true;
};

/**
 * Attachments still on their way, as rows for the panel that asked.
 *
 * The SIDE is derived from the operation, not stored: an add made from the
 * company's card names this record in the route (`companyId`), an add made from
 * the person's card names it in the body (`personId`). Same link, read from the
 * end you are standing on — exactly as the server's two read routes do.
 *
 * ⚠️ A person being CREATED with the link has no record to open yet, so these
 * rows are never tappable; the id is the operation's, and it is there so remove
 * can find it.
 */
export function pendingContactLinks(
  ops: readonly OutboxOp[],
  recordId: string,
  side: 'person' | 'company',
): PendingContactLink[] {
  const rows: PendingContactLink[] = [];
  for (const o of ops) {
    if (o.op !== 'customer.contactAdd' || !open(o)) continue;
    const body = (o.payload.body ?? {}) as AddBody;
    const companyId = o.payload.params?.companyId;
    const name = body.$name ?? '';
    if (side === 'person' && companyId === recordId) {
      rows.push({ id: o.id, opId: o.id, waiting: true, role: body.role ?? null, isPrimary: false, person: { id: body.$shownId ?? o.id, name } });
    } else if (side === 'company' && body.personId === recordId && companyId) {
      rows.push({ id: o.id, opId: o.id, waiting: true, role: body.role ?? null, isPrimary: false, company: { id: companyId, name } });
    }
  }
  return rows;
}

/** Links with a detach still on the phone — gone from the panel, and not sent yet. */
export function pendingContactRemovals(ops: readonly OutboxOp[]): ReadonlySet<string> {
  return new Set(
    ops
      .filter((o) => o.op === 'customer.contactRemove' && open(o))
      .map((o) => o.payload.params?.linkId)
      .filter((id): id is string => !!id),
  );
}

/**
 * The panel as the member last left it: detached rows gone, a queued
 * make-primary shown, and the star on nobody else.
 *
 * ⚠️ One primary per company is enforced HERE as well as on the server. The
 * server does it in a transaction; the screen has to agree with it before the
 * request has even been sent, or a member with no signal sees two stars.
 */
export function applyPendingContacts(
  links: readonly MobileCustomerContact[],
  ops: readonly OutboxOp[],
): MobileCustomerContact[] {
  const removed = pendingContactRemovals(ops);
  const primary = ops.find(
    (o) => o.op === 'customer.contactUpdate' && open(o) && (o.payload.body as { isPrimary?: boolean } | undefined)?.isPrimary === true,
  )?.payload.params?.linkId;
  const kept = removed.size ? links.filter((l) => !removed.has(l.id)) : links;
  if (!primary || !kept.some((l) => l.id === primary)) return kept as MobileCustomerContact[];
  return kept.map((l) => (l.isPrimary === (l.id === primary) ? l : { ...l, isPrimary: l.id === primary }));
}

/**
 * Reminders ticked off (or back on) with no signal — `activityId → doneAt`.
 *
 * The LAST word wins, which is the same thing the lane guarantees on the wire:
 * ticked, un-ticked and ticked again in a basement is one state, not three.
 *
 * ⚠️ The time is the TAP's, taken from the operation, never `Date.now()` at read
 * time. A value that changes on every read is a new row object on every render,
 * which is how a memoised list stops being memoised.
 */
export function pendingActivityDone(ops: readonly OutboxOp[]): ReadonlyMap<string, string | null> {
  const out = new Map<string, string | null>();
  for (const o of [...ops].sort((a, b) => a.createdAt - b.createdAt)) {
    if (o.op !== 'customer.activityUpdate' || !open(o)) continue;
    const id = o.payload.params?.activityId;
    const done = (o.payload.body as { done?: boolean } | undefined)?.done;
    if (id && typeof done === 'boolean') out.set(id, done ? new Date(o.createdAt).toISOString() : null);
  }
  return out;
}
