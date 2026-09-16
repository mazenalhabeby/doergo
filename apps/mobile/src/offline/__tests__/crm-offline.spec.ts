/**
 * The client record with no signal — the stage, the edit sheet, contact people
 * and a reminder's tick.
 *
 * What these pin is the three things that were decided rather than discovered:
 * ORDER (a change arrives after the client it is about), GRANULARITY (only what
 * the member changed travels, so a replay does not revert the office), and the
 * LINK ID the phone cannot know.
 */
import { SyncEngine, type SyncTransport, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { compact } from '../outbox/compaction';
import type { OutboxOp } from '../outbox/types';
import {
  addContactFromPhone,
  changedFields,
  discardPendingContact,
  removeContactFromPhone,
  setActivityDoneFromPhone,
  updateClientFromPhone,
  updateContactFromPhone,
} from '../crm/client-actions';
import {
  applyPendingClient,
  applyPendingContacts,
  pendingActivityDone,
  pendingClientPatch,
  pendingContactLinks,
} from '../crm/client-overlay';
import { createFromPhone } from '../actions/queued-create';

jest.mock('../offline-context', () => ({ useOffline: () => ({}), useSyncStatus: () => ({ operations: [] }) }));

function setup(opts: { refuse?: boolean } = {}) {
  const sent: OutboxOp[] = [];
  let online = false;
  let t = 1_757_849_000_000;
  const transport: SyncTransport = {
    async push(ops) {
      if (!online) throw new Error('Network request failed');
      sent.push(...ops);
      return opts.refuse
        ? { ok: true, results: ops.map((o) => ({ id: o.id, status: 'rejected' as const, code: 'FORBIDDEN', message: 'Not allowed to change this client' })) }
        : { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' as const, body: {} })) };
    },
    async pull() { throw new Error('unused'); },
  };
  const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };
  const store = new MemoryOutboxStore();
  let n = 0;
  const e = new SyncEngine({
    userId: 'u1', organizationId: 'o1', store, transport, records,
    now: () => t, random: () => 0.5, newId: () => `op-${++n}`,
  });
  // The screens never wait 8s for a settle in a test.
  const settle = e.enqueueAndSettle.bind(e);
  e.enqueueAndSettle = (input) => settle(input, 5);
  return { e, store, sent, goOnline: () => { online = true; t += 60_000; } };
}

/** The phone-generated id a client written with no signal already carries. */
const CLIENT = '0190f3c2-7b1a-7c3d-9e4f-000000000001';

describe('a client entered in a basement, then worked on', () => {
  it('a stage change waits for the create and addresses the phone’s own id', async () => {
    const s = setup();
    await s.e.start();
    // Exactly how the clients list queues one — the id is the phone's.
    const created = await createFromPhone(s.e, { op: 'customer.create', lane: 'crm:new', body: { name: 'BILLA AG' }, id: CLIENT });
    expect(created.id).toBe(CLIENT);

    await updateClientFromPhone(s.e, { customerId: CLIENT, patch: { status: 'QUALIFIED' } });
    const change = s.e.operations()[1]!;
    expect(change.op).toBe('customer.update');
    expect(change.lane).toBe(`crm:${CLIENT}`);
    // ⚠️ No id mapping: the route is addressed with the id the phone minted.
    expect(change.payload).toEqual({ params: { customerId: CLIENT }, body: { status: 'QUALIFIED' } });
    expect(change.dependsOn).toEqual([created.opId]);

    s.goOnline();
    await s.e.flush();
    await s.e.flush();
    expect(s.sent.map((o) => o.op)).toEqual(['customer.create', 'customer.update']);
  });

  it('names no dependency once the client is on the server', async () => {
    const s = setup();
    await s.e.start();
    await updateClientFromPhone(s.e, { customerId: 'server-side-id', patch: { status: 'CUSTOMER' } });
    expect(s.e.operations()[0]!.dependsOn).toEqual([]);
  });

  it('shows the change on the record, and gives the record back untouched when nothing waits', async () => {
    const s = setup();
    await s.e.start();
    const record = { id: CLIENT, name: 'BILLA AG', status: 'LEAD' as string };
    // Nothing queued: the very same object, so every memo above it keeps its identity.
    expect(applyPendingClient(record as never, s.e.operations())).toBe(record);

    await updateClientFromPhone(s.e, { customerId: CLIENT, patch: { status: 'QUALIFIED' } });
    const shown = applyPendingClient(record as never, s.e.operations());
    expect(shown).toMatchObject({ status: 'QUALIFIED', pendingSync: true });
    // The server's copy is never written to — only the view of it.
    expect(record.status).toBe('LEAD');
  });

  it('a refusal takes the change off the record (nothing to roll back by hand)', async () => {
    const s = setup({ refuse: true });
    await s.e.start();
    s.goOnline();
    const outcome = await updateClientFromPhone(s.e, { customerId: CLIENT, patch: { status: 'QUALIFIED' } });
    expect(outcome).toMatchObject({ kind: 'refused', message: 'Not allowed to change this client' });
    // `outcomeOf` discarded it, so the overlay it was feeding is simply gone —
    // the screen never has to remember what the old value was.
    expect(pendingClientPatch(s.e.operations(), CLIENT)).toBeNull();
    expect(applyPendingClient({ id: CLIENT, name: 'BILLA AG', status: 'LEAD' } as never, s.e.operations()))
      .toMatchObject({ status: 'LEAD' });
  });
});

describe('repeated changes to one client', () => {
  const op = (over: Partial<OutboxOp>): OutboxOp => ({
    id: 'x', userId: 'u1', organizationId: 'o1', op: 'customer.update', lane: `crm:${CLIENT}`,
    dependsOn: [], payload: { params: { customerId: CLIENT }, body: {} },
    state: 'pending', attempts: 0, createdAt: 1, updatedAt: 1, ...over,
  });

  it('four stages tapped offline become ONE request carrying the last one', () => {
    const taps = ['CONTACTED', 'QUALIFIED', 'CUSTOMER', 'INACTIVE'].map((status, i) =>
      op({ id: `o${i}`, createdAt: i, payload: { params: { customerId: CLIENT }, body: { status } } }));
    const changed = compact(taps, 99);
    expect(changed.filter((o) => o.state === 'discarded').map((o) => o.id)).toEqual(['o0', 'o1', 'o2']);
    expect(changed.find((o) => o.id === 'o3')!.payload.body).toEqual({ status: 'INACTIVE' });
  });

  it('merges a stage change with an edit rather than dropping either', () => {
    const changed = compact([
      op({ id: 'a', createdAt: 1, payload: { params: { customerId: CLIENT }, body: { status: 'CUSTOMER' } } }),
      op({ id: 'b', createdAt: 2, payload: { params: { customerId: CLIENT }, body: { phone: '+43 1 234' } } }),
    ], 99);
    expect(changed.find((o) => o.id === 'b')!.payload.body).toEqual({ status: 'CUSTOMER', phone: '+43 1 234' });
  });

  it('never merges two DIFFERENT clients, though they are the same operation', () => {
    const other = `crm:${CLIENT}-b`;
    const changed = compact([
      op({ id: 'a', createdAt: 1, payload: { params: { customerId: CLIENT }, body: { status: 'CUSTOMER' } } }),
      op({ id: 'b', createdAt: 2, lane: other, payload: { params: { customerId: 'other' }, body: { status: 'LEAD' } } }),
    ], 99);
    expect(changed).toEqual([]);
  });

  it('never merges two DIFFERENT reminders on one client — the lane is shared', () => {
    const tick = (id: string, activityId: string, at: number): OutboxOp => op({
      id, createdAt: at, op: 'customer.activityUpdate',
      payload: { params: { customerId: CLIENT, activityId }, body: { done: true } },
    });
    expect(compact([tick('a', 'act-1', 1), tick('b', 'act-2', 2)], 99)).toEqual([]);
    // The same reminder ticked twice IS one state.
    expect(compact([tick('a', 'act-1', 1), tick('b', 'act-1', 2)], 99).map((o) => [o.id, o.state]))
      .toEqual([['a', 'discarded'], ['b', 'pending']]);
  });

  it('leaves an attachment alone — a create is not a "set this value"', () => {
    const add = (id: string, at: number): OutboxOp => op({
      id, createdAt: at, op: 'customer.contactAdd',
      payload: { params: { companyId: CLIENT }, body: { personId: `p${id}`, $name: 'Anna' } },
    });
    expect(compact([add('a', 1), add('b', 2)], 99)).toEqual([]);
  });
});

describe('the edit sheet sends only what changed', () => {
  const before = {
    id: CLIENT, name: 'BILLA AG', type: 'COMPANY', phone: '+43 1 111', email: null,
    vatId: 'ATU123', notes: null, locale: null, spaceId: 'sp1',
  } as never;

  it('leaves untouched fields out, so a replay cannot revert the office', () => {
    const patch = changedFields(before, {
      name: 'BILLA AG', type: 'COMPANY', phone: '+43 1 222', email: '',
      vatId: 'ATU123', notes: '', locale: null, spaceId: 'sp1',
    } as never);
    // Only the number the member actually retyped.
    expect(patch).toEqual({ phone: '+43 1 222' });
  });

  it('keeps a BLANKED company field — an omitted key would leave the old value', () => {
    const patch = changedFields(before, { type: 'PERSON', vatId: '', name: 'BILLA AG' } as never);
    expect(patch).toEqual({ type: 'PERSON', vatId: '' });
  });

  it('treats null and empty as the same absence', () => {
    expect(changedFields(before, { email: '', notes: '', locale: null } as never)).toEqual({});
  });
});

describe('contact people', () => {
  it('attaches with both ends named as dependencies, and shows a row meanwhile', async () => {
    const s = setup();
    await s.e.start();
    const company = await createFromPhone(s.e, { op: 'customer.create', lane: 'crm:new', body: { name: 'Siemens AG' }, id: CLIENT });

    await addContactFromPhone(s.e, {
      companyId: CLIENT, personId: 'anna-1', role: 'Buyer', isPrimary: true,
      shownName: 'Anna Huber', shownId: 'anna-1',
    });
    const add = s.e.operations()[1]!;
    expect(add.dependsOn).toEqual([company.opId]);
    expect(add.payload.body).toEqual({ personId: 'anna-1', role: 'Buyer', isPrimary: true, $name: 'Anna Huber', $shownId: 'anna-1' });

    // The company's "Contact people" card shows it; the person's "Works at" does not.
    const rows = pendingContactLinks(s.e.operations(), CLIENT, 'person');
    expect(rows).toEqual([expect.objectContaining({ opId: add.id, waiting: true, role: 'Buyer', person: { id: 'anna-1', name: 'Anna Huber' } })]);
    expect(pendingContactLinks(s.e.operations(), CLIENT, 'company')).toEqual([]);
    // From the person's record it is the other way round.
    expect(pendingContactLinks(s.e.operations(), 'anna-1', 'company'))
      .toEqual([expect.objectContaining({ company: { id: CLIENT, name: 'Anna Huber' } })]);
  });

  it('carries no $ key onto the wire', async () => {
    const s = setup();
    await s.e.start();
    await addContactFromPhone(s.e, { companyId: 'c1', personId: 'p1', shownName: 'Anna', shownId: 'p1' });
    s.goOnline();
    await s.e.flush();
    // The transport is what strips them (see creates-offline.spec.ts); what this
    // pins is that nothing but $-prefixed keys was used to carry the name.
    const body = s.sent[0]!.payload.body as Record<string, unknown>;
    expect(Object.keys(body).filter((k) => k.startsWith('$'))).toEqual(['$name', '$shownId']);
  });

  it('a waiting row is CANCELLED, never detached — there is no link id to delete', async () => {
    const s = setup();
    await s.e.start();
    await addContactFromPhone(s.e, { companyId: 'c1', personId: 'p1', shownName: 'Anna', shownId: 'p1' });
    const opId = s.e.operations()[0]!.id;
    expect(await discardPendingContact(s.e, opId)).toBe(true);
    expect(pendingContactLinks(s.e.operations(), 'c1', 'person')).toEqual([]);
    // Nothing is queued for the server, because nothing was ever sent to it.
    expect(s.e.operations().every((o) => o.state === 'discarded')).toBe(true);
    // Asked twice (a double tap) it says so instead of discarding something else.
    expect(await discardPendingContact(s.e, opId)).toBe(false);
    s.goOnline();
    await s.e.flush();
    expect(s.sent).toEqual([]);
  });

  it('refuses to call back one the SERVER has already answered', async () => {
    /*
      ⚠️ The offline case is the ordinary one and must still cancel: the first
      flush fails at the transport, so the operation is already on its second
      attempt a second after it was made. What disqualifies it is an HTTP answer
      — the server heard it, and a phone that "cancelled" it afterwards would
      disagree with the record for ever.
    */
    const s = setup();
    await s.e.start();
    await addContactFromPhone(s.e, { companyId: 'c1', personId: 'p1', shownName: 'Anna', shownId: 'p1' });
    const op = s.e.operations()[0]!;
    expect([op.state, op.attempts, op.lastError?.code]).toEqual(['retry', 1, 'NETWORK']);

    await s.store.save([{ ...op, state: 'retry', attempts: 1, lastError: { code: 'HTTP_503' } }]);
    expect(await discardPendingContact(s.e, op.id)).toBe(false);
  });

  it('detaches a real link on the company’s lane, and the panel drops it meanwhile', async () => {
    const s = setup();
    await s.e.start();
    await removeContactFromPhone(s.e, { linkId: 'link-9', companyId: 'c1' });
    const op = s.e.operations()[0]!;
    expect([op.op, op.lane, op.payload]).toEqual(['customer.contactRemove', 'crm:c1', { params: { linkId: 'link-9' } }]);

    const links = [{ id: 'link-9', person: { id: 'p1', name: 'Anna' } }, { id: 'link-8', person: { id: 'p2', name: 'Bert' } }];
    expect(applyPendingContacts(links, s.e.operations()).map((l) => l.id)).toEqual(['link-8']);
  });

  it('a queued make-primary moves the star off everybody else', async () => {
    const s = setup();
    await s.e.start();
    await updateContactFromPhone(s.e, { linkId: 'link-8', companyId: 'c1', isPrimary: true });
    const links = [
      { id: 'link-9', isPrimary: true, person: { id: 'p1', name: 'Anna' } },
      { id: 'link-8', isPrimary: false, person: { id: 'p2', name: 'Bert' } },
    ];
    expect(applyPendingContacts(links, s.e.operations()).map((l) => [l.id, l.isPrimary]))
      .toEqual([['link-9', false], ['link-8', true]]);
  });

  it('hands the panel back untouched when nothing is queued', async () => {
    const s = setup();
    await s.e.start();
    const links = [{ id: 'link-9', person: { id: 'p1', name: 'Anna' } }];
    expect(applyPendingContacts(links, s.e.operations())).toBe(links);
  });
});

describe('ticking a reminder off', () => {
  it('waits for the reminder’s own create as well as the client’s', async () => {
    const s = setup();
    await s.e.start();
    const client = await createFromPhone(s.e, { op: 'customer.create', lane: 'crm:new', body: { name: 'BILLA AG' }, id: CLIENT });
    const reminder = await createFromPhone(s.e, {
      op: 'customer.activity', lane: `crm:${CLIENT}`, params: { customerId: CLIENT },
      body: { type: 'REMINDER', body: 'Ring back' },
    });

    await setActivityDoneFromPhone(s.e, { customerId: CLIENT, activityId: reminder.id, done: true });
    const tick = s.e.operations()[2]!;
    expect(tick.dependsOn).toEqual([client.opId, reminder.opId]);
    expect(tick.payload).toEqual({ params: { customerId: CLIENT, activityId: reminder.id }, body: { done: true } });

    s.goOnline();
    await s.e.flush();
    await s.e.flush();
    await s.e.flush();
    expect(s.sent.map((o) => o.op)).toEqual(['customer.create', 'customer.activity', 'customer.activityUpdate']);
  });

  it('reads back as done at the time of the TAP, stable across reads', async () => {
    const s = setup();
    await s.e.start();
    await setActivityDoneFromPhone(s.e, { customerId: CLIENT, activityId: 'act-1', done: true });
    const first = pendingActivityDone(s.e.operations()).get('act-1');
    expect(typeof first).toBe('string');
    // Read again: the same instant, so a memoised row is not rebuilt by the act
    // of some other operation moving in the outbox.
    expect(pendingActivityDone(s.e.operations()).get('act-1')).toBe(first);
  });

  it('un-ticking replaces the tick rather than adding to it', async () => {
    const s = setup();
    await s.e.start();
    await setActivityDoneFromPhone(s.e, { customerId: CLIENT, activityId: 'act-1', done: true });
    await setActivityDoneFromPhone(s.e, { customerId: CLIENT, activityId: 'act-1', done: false });
    expect(pendingActivityDone(s.e.operations()).get('act-1')).toBeNull();
  });
});
