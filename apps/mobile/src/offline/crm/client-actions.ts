import { outcomeOf, type ActionOutcome } from '../actions/outcome';
import { openOpFor } from '../outbox/open-ops';
import type { OutboxOp } from '../outbox/types';
import type { SyncEngine } from '../sync-engine';
import type { MobileCustomer } from '../../lib/api';

/*
  EVERYTHING ABOUT ONE CLIENT TRAVELS IN ONE LANE, `crm:<customerId>`.

  Order within a lane is kept, so a stage tapped, an edit saved and a reminder
  ticked in a basement reach the server in the order they were made — the last
  word on a field is the last thing the member did, not whichever request the
  radio happened to get out first.

  ⚠️ THE ID PROBLEM IS ALREADY SOLVED AND IS NOT RE-SOLVED HERE. `create_customer`
  honours the phone's own id when it matches CLIENT_ID (customers.service), so a
  client written with no signal ALREADY HAS ITS FINAL ID: a stage change on it
  addresses that id normally. What is left is ORDER — the change must not arrive
  before the client exists — and that is what `dependsOn` is for. The create
  itself sits in the `crm:new` lane (it is not about a client yet), which is
  exactly why the dependency has to be named rather than assumed from the lane.
*/
export const clientLane = (customerId: string) => `crm:${customerId}`;

/** The queued create for this client, if it has not been accepted yet. */
export function pendingClientCreate(ops: readonly OutboxOp[], customerId: string | null | undefined): string | undefined {
  if (!customerId) return undefined;
  return openOpFor(ops, 'customer.create', (b) => b.id === customerId)?.id;
}

/**
 * What a change touching these clients must wait for.
 *
 * Takes several because a contact link has TWO ends, and either of them may be
 * a client somebody entered on the same walk back to the van.
 */
export function dependsOnClients(ops: readonly OutboxOp[], ...customerIds: (string | null | undefined)[]): string[] {
  const waiting = customerIds.map((id) => pendingClientCreate(ops, id)).filter((id): id is string => !!id);
  return [...new Set(waiting)];
}

/**
 * ONLY WHAT THE MEMBER ACTUALLY CHANGED.
 *
 * ⚠️ This is what makes the save safe to REPLAY. A stage is one field and the
 * member's tap is the latest word on it, so last write wins is the right
 * answer there. A whole record is not: a save written in a basement at 09:50
 * and sent at 11:00 would restate every field as the form found them, silently
 * undoing a phone number the office corrected at 10:00 — on fields nobody on
 * this phone ever looked at. Diffed, last-write-wins applies PER FIELD, which
 * is the granularity the member actually acted at.
 *
 * ⚠️ A BLANKED field is a change and must travel. Switching a client from
 * company to person clears its VAT number through `clearCompanyFields`, and
 * '' ≠ 'ATU123' — so the diff keeps it, and an omitted key does not leave the
 * old value on a record that is no longer a company.
 */
export function changedFields(before: MobileCustomer, payload: Partial<MobileCustomer>): Partial<MobileCustomer> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    // The record holds null where the form holds '' (and vice versa); neither
    // is a change the member made.
    const had = (before as unknown as Record<string, unknown>)[key];
    const same = value === had || ((value === '' || value === null) && (had === '' || had === null || had === undefined));
    if (!same) out[key] = value;
  }
  return out as Partial<MobileCustomer>;
}

/**
 * Change a client — its stage, its language for emails, or the whole edit form.
 *
 * ONE operation for all three, because they are one PATCH; which fields travel
 * is the screen's business. Repeated changes to the same client are merged
 * before they are sent (see outbox/compaction.ts), so tapping through four
 * stages in a basement sends one request, not four.
 *
 * ⚠️ The body must carry only the fields the member CHANGED — `changedFields`
 * above is how, and why.
 */
export async function updateClientFromPhone(
  engine: SyncEngine,
  input: { customerId: string; patch: Record<string, unknown> },
): Promise<ActionOutcome> {
  const op = await engine.enqueueAndSettle({
    op: 'customer.update',
    lane: clientLane(input.customerId),
    entityId: input.customerId,
    dependsOn: dependsOnClients(engine.operations(), input.customerId),
    payload: { params: { customerId: input.customerId }, body: input.patch },
  });
  return outcomeOf(engine, op);
}

/**
 * Attach a person to a company — an existing person, or a new one created with
 * the link.
 *
 * ⚠️ `$name` is the phone's own key and never reaches the server (`$` keys are
 * stripped in http-transport). It is here so the row can say WHO is waiting:
 * when an existing person is chosen the body carries their id and nothing else,
 * and a row reading "Waiting to send" with no name on it is worse than no row.
 */
export async function addContactFromPhone(
  engine: SyncEngine,
  input: {
    companyId: string;
    personId?: string;
    person?: { name: string; email?: string; phone?: string };
    role?: string;
    isPrimary?: boolean;
    /** The name to show while it waits, and the record the row opens. */
    shownName: string;
    shownId?: string;
  },
): Promise<ActionOutcome> {
  const op = await engine.enqueueAndSettle({
    op: 'customer.contactAdd',
    lane: clientLane(input.companyId),
    entityId: input.companyId,
    // Both ends: either may itself be a client still on its way to the server.
    dependsOn: dependsOnClients(engine.operations(), input.companyId, input.personId),
    payload: {
      params: { companyId: input.companyId },
      body: {
        ...(input.personId ? { personId: input.personId } : {}),
        ...(input.person ? { person: input.person } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.isPrimary ? { isPrimary: true } : {}),
        $name: input.shownName,
        ...(input.shownId ? { $shownId: input.shownId } : {}),
      },
    },
  });
  return outcomeOf(engine, op);
}

/*
  ── The two that address a LINK ID ──────────────────────────────────────────

  ⚠️ `contactUpdate` and `contactRemove` take an id THE SERVER MINTS. Unlike a
  customer id the phone cannot know it, and `addContact` accepts no
  client-supplied one — the gateway forwards none and the service's create names
  no id — so there is nothing to invent that the server would honour.

  What follows from that:

   · A contact ADDED while offline offers neither. Making somebody primary is
     expressible ON the add itself (`isPrimary`), so the common case needs no
     follow-up at all; the star is simply not offered on a row that is still
     waiting, rather than offered and then refused.
   · "Remove" on a row that is still waiting CANCELS THE QUEUED ADD (see
     `discardPendingContact`). Nothing was sent, so there is nothing to undo on
     the server — queueing a DELETE for a link id that does not exist would be
     refused, correctly, and would read as the app breaking.
   · On a link the server already knows, both queue normally, waiting only on a
     pending create of the company they belong to.
*/

export async function updateContactFromPhone(
  engine: SyncEngine,
  input: { linkId: string; companyId: string; role?: string | null; isPrimary?: boolean },
): Promise<ActionOutcome> {
  const op = await engine.enqueueAndSettle({
    op: 'customer.contactUpdate',
    lane: clientLane(input.companyId),
    entityId: input.linkId,
    dependsOn: dependsOnClients(engine.operations(), input.companyId),
    payload: {
      params: { linkId: input.linkId },
      body: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      },
    },
  });
  return outcomeOf(engine, op);
}

export async function removeContactFromPhone(
  engine: SyncEngine,
  input: { linkId: string; companyId: string },
): Promise<ActionOutcome> {
  const op = await engine.enqueueAndSettle({
    op: 'customer.contactRemove',
    lane: clientLane(input.companyId),
    entityId: input.linkId,
    dependsOn: dependsOnClients(engine.operations(), input.companyId),
    payload: { params: { linkId: input.linkId } },
  });
  return outcomeOf(engine, op);
}

/**
 * Call back an attachment that has never left the phone.
 *
 * False when it is already on its way — it may have reached the server on an
 * answer that was lost, so the only honest answer is to wait for it and detach
 * the real link. The screen says that rather than appearing to have worked.
 */
export async function discardPendingContact(engine: SyncEngine, opId: string): Promise<boolean> {
  const op = engine.operations().find((o) => o.id === opId && o.op === 'customer.contactAdd');
  if (!op) return false;
  return engine.cancelPending(opId);
}

/**
 * Tick a reminder off, or back on.
 *
 * ⚠️ It waits for the reminder's OWN create as well as the client's. A reminder
 * written and ticked off in the same basement is two queued operations about a
 * row the server has never seen; `add_customer_activity` honours the phone's id
 * the same way `create_customer` does, so the id is right — only the order needs
 * saying.
 */
export async function setActivityDoneFromPhone(
  engine: SyncEngine,
  input: { customerId: string; activityId: string; done: boolean },
): Promise<ActionOutcome> {
  const ops = engine.operations();
  const create = openOpFor(ops, 'customer.activity', (b) => b.id === input.activityId);
  const op = await engine.enqueueAndSettle({
    op: 'customer.activityUpdate',
    lane: clientLane(input.customerId),
    entityId: input.activityId,
    dependsOn: [...dependsOnClients(ops, input.customerId), ...(create ? [create.id] : [])],
    payload: {
      params: { customerId: input.customerId, activityId: input.activityId },
      body: { done: input.done },
    },
  });
  return outcomeOf(engine, op);
}
