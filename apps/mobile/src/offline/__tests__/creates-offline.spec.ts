/**
 * Creates from the phone — chat, time off, support, shift issues, expenses.
 */
import { SyncEngine, type SyncTransport, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { MemoryFileRegistry } from '../files/sqlite-file-registry';
import { OfflineFiles } from '../files/offline-files';
import { FileUploadPreparer } from '../files/upload-preparer';
import type { FileDisk } from '../files/types';
import type { OutboxOp } from '../outbox/types';

jest.mock('../ids', () => {
  let n = 0;
  return { uuidv7: () => `0190f3c2-7b1a-7c3d-9e4f-q${String(++n).padStart(11, '0')}` };
});
// The hook module imports React context; only its pure parts are used here.
jest.mock('../offline-context', () => ({ useOffline: () => ({}), useSyncStatus: () => ({ operations: [] }) }));
/* eslint-disable @typescript-eslint/no-require-imports */
const { createFromPhone, pendingCreates } = require('../actions/queued-create') as typeof import('../actions/queued-create');
const { reportIssueFromPhone, sendIssueMessageFromPhone, pendingIssueEvents } = require('../issues/issue-actions') as typeof import('../issues/issue-actions');
const { submitExpenseFromPhone } = require('../assets/expense-actions') as typeof import('../assets/expense-actions');
/* eslint-enable @typescript-eslint/no-require-imports */

function setup(opts: { answer?: (path: string, n: number) => Record<string, unknown> } = {}) {
  const sent: OutboxOp[] = [];
  const presigned: { path: string; body: Record<string, unknown> }[] = [];
  let online = false;
  let t = 1_757_849_000_000;
  const transport: SyncTransport = {
    async push(ops) {
      if (!online) throw new Error('Network request failed');
      sent.push(...ops);
      return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' as const, body: {} })) };
    },
    async pull() { throw new Error('unused'); },
  };
  const registry = new MemoryFileRegistry();
  const disk: FileDisk & { uriFor(id: string, mime: string): string } = {
    async keep(i) { return { path: `file:///doc/${i.id}.jpg`, bytes: 700, mime: 'image/jpeg', width: 800, height: 600 }; },
    async remove() {},
    uriFor: (id) => `file:///doc/${id}.jpg`,
  };
  const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };
  let n = 0;
  const e = new SyncEngine({
    userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), transport, records, now: () => t, random: () => 0.5,
    newId: () => `op-${++n}`,
    preparer: new FileUploadPreparer({
      files: registry, disk,
      uploader: {
        async presign(path, body) {
          // Like the server: no link for an issue it does not have yet.
          if (path.startsWith('/shift-issues/') && !sent.some((o) => o.op === 'shiftIssue.create')) throw Object.assign(new Error('404'), {});
          presigned.push({ path, body });
          return opts.answer ? opts.answer(path, presigned.length) : { uploadUrl: 'u', fileKey: `key-for${path}` };
        },
        async put() {},
      },
    }),
  });
  const settle = e.enqueueAndSettle.bind(e);
  e.enqueueAndSettle = (input) => settle(input, 5);
  return { e, files: new OfflineFiles({ registry, disk }), registry, sent, presigned, goOnline: () => { online = true; t += 60_000; } };
}

describe('createFromPhone', () => {
  it('names the record, puts the id where the route reads it, and lists it as pending', async () => {
    const s = setup();
    await s.e.start();
    const { id, outcome } = await createFromPhone(s.e, { op: 'timeOff.request', lane: 'timeoff:u1', params: { employeeId: 'u1' }, body: { startDate: '2030-01-01', endDate: '2030-01-03' } });
    expect(outcome.kind).toBe('queued');
    expect(s.e.operations()[0]!.payload).toEqual({ params: { employeeId: 'u1' }, body: { startDate: '2030-01-01', endDate: '2030-01-03', id } });
    expect(pendingCreates(s.e.operations(), 'timeOff.request')).toEqual([expect.objectContaining({ id, body: expect.objectContaining({ startDate: '2030-01-01' }) })]);
    // A route that calls something else `id` gets the phone id under its own name.
    await createFromPhone(s.e, { op: 'expense.submit', lane: 'x', params: { assetId: 'a1' }, body: { amountCents: 1 }, idField: 'entryId' });
    expect(s.e.operations()[1]!.payload.body).toMatchObject({ entryId: expect.any(String) });
    expect(s.e.operations()[1]!.payload.body).not.toHaveProperty('id');
  });
});

describe('shift issues', () => {
  it('sends the issue first, then each photo as its own message with the uploaded attachment', async () => {
    const s = setup();
    await s.e.start();
    const { issueId } = await reportIssueFromPhone(s.e, s.files, { title: 'No power', photos: [{ uri: 'file:///c/a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg' }] });
    await sendIssueMessageFromPhone(s.e, s.files, { issueId, body: 'Still out', photos: [] });

    const shown = pendingIssueEvents(issueId, s.e.operations(), (id) => `file:///doc/${id}.jpg`, { id: 'u1', name: 'Mike' });
    expect(shown.map((e) => [e.body, e.attachments?.length])).toEqual([[null, 1], ['Still out', 0]]);

    s.goOnline();
    await s.e.flush();
    await s.e.flush();
    expect(s.sent.map((o) => o.op)).toEqual(['shiftIssue.create', 'shiftIssue.message', 'shiftIssue.message']);
    const photoMessage = s.sent.find((o) => (o.payload.body as { attachments?: unknown[] }).attachments)!;
    expect(photoMessage.payload.body).toEqual({
      id: expect.any(String), body: '',
      attachments: [{ fileKey: `key-for/shift-issues/${issueId}/attachments/presign`, fileName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 700, width: 800, height: 600 }],
    });
    expect(s.e.operations().every((o) => o.state === 'done')).toBe(true);
    expect(s.registry.rows.size).toBe(0);
  });
});

describe('expenses', () => {
  it('uploads the receipt under the expense route names and never sends the phone marker', async () => {
    const s = setup();
    await s.e.start();
    await submitExpenseFromPhone(s.e, s.files, { assetId: 'van-1', category: 'Fuel', amountCents: 6420, occurredAt: '2026-09-14T08:00:00.000Z', photo: { uri: 'file:///c/r.jpg', mime: 'image/jpeg' } });
    s.goOnline();
    await s.e.flush();
    expect(s.presigned[0]).toEqual({ path: '/assets/van-1/expenses/presign', body: { fileName: 'receipt.jpg', mimeType: 'image/jpeg' } });
    const body = s.sent[0]!.payload.body as Record<string, unknown>;
    expect(body).toMatchObject({ entryId: expect.any(String), receiptKey: 'key-for/assets/van-1/expenses/presign', receiptMime: 'image/jpeg', receiptName: 'receipt.jpg', amountCents: 6420 });
    expect(body).not.toHaveProperty('receiptPending');
    expect(s.registry.rows.size).toBe(0);
  });

  it('sends an already-uploaded PDF as it is', async () => {
    const s = setup();
    await s.e.start();
    await submitExpenseFromPhone(s.e, s.files, { assetId: 'van-1', category: 'Fuel', amountCents: 100, occurredAt: '2026-09-14T08:00:00.000Z', uploadedKey: 'o1/assets/van-1/x.pdf' });
    s.goOnline();
    await s.e.flush();
    expect(s.presigned).toHaveLength(0);
    expect(s.sent[0]!.payload.body).toMatchObject({ receiptKey: 'o1/assets/van-1/x.pdf', receiptMime: 'application/pdf' });
  });
});

describe('documents I supply', () => {
  it('uploads front and back into one filing, sized, and deletes both copies once filed', async () => {
    // This route's presign answers `{ url, key }`.
    const s = setup({ answer: (_path, n) => ({ url: 'https://s3/put', key: `staging-${n}` }) });
    await s.e.start();
    const front = await s.files.keep({ id: 'front-file-000000001', kind: 'document', mime: 'image/jpeg', uri: 'file:///c/f.jpg' });
    const back = await s.files.keep({ id: 'back-file-0000000001', kind: 'document', mime: 'image/jpeg', uri: 'file:///c/b.jpg' });
    await createFromPhone(s.e, { op: 'document.supply', lane: 'document:t1', body: { typeId: 't1', title: 'Licence', $front: front.id, $back: back.id } });
    s.goOnline();
    await s.e.flush();

    expect(s.presigned).toEqual([
      { path: '/documents/mine/upload-url', body: { typeId: 't1', mimeType: 'image/jpeg', sizeBytes: 700 } },
      { path: '/documents/mine/upload-url', body: { typeId: 't1', mimeType: 'image/jpeg', sizeBytes: 700 } },
    ]);
    expect(s.sent[0]!.payload.body).toMatchObject({ stagingKey: 'staging-1', backStagingKey: 'staging-2', typeId: 't1' });
    expect(s.registry.rows.size).toBe(0);
  });
});

describe('the transport', () => {
  it('never sends a key only the phone reads', async () => {
    const posted: any[] = [];
    jest.resetModules();
    jest.doMock('../../lib/api/client', () => ({
      ApiError: class extends Error {},
      fetchWithAuth: async (_path: string, init: { body: string }) => {
        posted.push(JSON.parse(init.body));
        return { results: [] };
      },
    }));
    jest.doMock('../../lib/api/attachments', () => ({ uploadToPresignedUrl: jest.fn() }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { httpSyncTransport } = require('../http-transport') as typeof import('../http-transport');
    await httpSyncTransport.push([{ id: 'o1', op: 'document.supply', lane: 'l', dependsOn: [], payload: { body: { typeId: 't', stagingKey: 'k', $front: 'f1', $back: 'b1' } } } as any]);
    expect(posted[0].operations[0].payload.body).toEqual({ typeId: 't', stagingKey: 'k' });
  });
});
