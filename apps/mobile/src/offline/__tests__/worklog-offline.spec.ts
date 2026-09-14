/**
 * The work log with no signal: notes and photos go through the outbox.
 */
import { SyncEngine, type SyncTransport, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { FileUploadPreparer } from '../files/upload-preparer';
import { MemoryFileRegistry } from '../files/sqlite-file-registry';
import { OfflineFiles } from '../files/offline-files';
import type { FileDisk, ObjectUploader } from '../files/types';
import type { OutboxOp } from '../outbox/types';

jest.mock('../ids', () => {
  let n = 0;
  return { uuidv7: () => `0190f3c2-7b1a-7c3d-9e4f-w${String(++n).padStart(11, '0')}` };
});
jest.mock('../../lib/api/worklog', () => ({ worklogApi: { list: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addWorklogEntry, worklogView } = require('../attendance/worklog') as typeof import('../attendance/worklog');

function setup() {
  const sent: OutboxOp[][] = [];
  const presigned: Record<string, unknown>[] = [];
  let online = false;
  const transport: SyncTransport = {
    async push(ops) {
      sent.push(ops);
      if (!online) throw new Error('Network request failed');
      return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' as const, body: {} })) };
    },
    async pull() {
      throw new Error('unused');
    },
  };
  const uploader: ObjectUploader = {
    async presign(path, body) {
      presigned.push({ path, ...body });
      return { uploadUrl: 'https://s3/put', fileKey: 'o1/attendance/key.jpg' };
    },
    async put() {},
  };
  const registry = new MemoryFileRegistry();
  const disk: FileDisk & { uriFor(id: string, mime: string): string } = {
    async keep(i) {
      return { path: `file:///doc/${i.id}.jpg`, bytes: 900, mime: 'image/jpeg', width: 2048, height: 1536 };
    },
    async remove() {},
    uriFor: (id) => `file:///doc/${id}.jpg`,
  };
  const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };
  let n = 0;
  let t = 1_757_849_000_000;
  const e = new SyncEngine({
    userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), transport, records,
    preparer: new FileUploadPreparer({ files: registry, disk, uploader }), newId: () => `op-${++n}`, now: () => t, random: () => 0.5,
  });
  const settle = e.enqueueAndSettle.bind(e);
  e.enqueueAndSettle = (input) => settle(input, 5);
  return {
    e, files: new OfflineFiles({ registry, disk }), sent, presigned,
    goOnline: () => (online = true),
    later: (ms: number) => (t += ms),
  };
}

describe('work log through the outbox', () => {
  it('queues a note and its photo in the work-log lane, the photo waiting for its note', async () => {
    const s = setup();
    await s.e.start();
    const { noteId, outcome } = await addWorklogEntry(s.e, s.files, {
      entryId: 'e1', body: 'Meter read', photos: [{ uri: 'file:///cache/m.jpg', fileName: 'm.jpg', mimeType: 'image/jpeg' }],
    });
    expect(outcome.kind).toBe('queued');
    const [note, photo] = s.e.operations();
    expect(note).toMatchObject({ op: 'worklog.note', lane: 'worklog:e1', payload: { params: { entryId: 'e1' }, body: { id: noteId, body: 'Meter read' } } });
    expect(photo).toMatchObject({ op: 'worklog.attachment', lane: 'worklog:e1', dependsOn: [note!.id], payload: { params: { noteId }, body: { mimeType: 'image/jpeg', width: 2048 } } });
  });

  it("uploads the photo with the work log's own field names once the note is sent", async () => {
    const s = setup();
    await s.e.start();
    const { noteId } = await addWorklogEntry(s.e, s.files, {
      entryId: 'e1', body: '(photo)', photos: [{ uri: 'file:///cache/m.jpg', fileName: 'm.jpg', mimeType: 'image/jpeg' }],
    });
    await s.e.flush();
    s.goOnline();
    s.later(60_000); // past the backoff
    await s.e.flush();

    expect(s.presigned[0]).toEqual({ path: `/attendance/worklog/${noteId}/attachments/presign`, fileName: 'm.jpg', mimeType: 'image/jpeg' });
    const confirm = s.sent.flat().find((o) => o.op === 'worklog.attachment' && (o.payload.body as { fileKey?: string }).fileKey);
    expect(confirm!.payload.body).toMatchObject({ fileKey: 'o1/attendance/key.jpg', mimeType: 'image/jpeg', fileSize: 900 });
    expect(confirm!.payload.body).not.toHaveProperty('fileType');
    expect(s.e.operations().every((o) => o.state === 'done')).toBe(true);
  });

  it('lays phone notes and uploading photos over the server list, each note once', () => {
    const ops = [
      { id: 'a', op: 'worklog.note', entityId: 'e1', state: 'retry', createdAt: 2, payload: { params: { entryId: 'e1' }, body: { id: 'n2', body: 'On the roof', at: '2026-09-14T10:00:00Z' } } },
      { id: 'b', op: 'worklog.attachment', entityId: 'e1', state: 'pending', createdAt: 3, payload: { params: { noteId: 'n1' }, body: { id: 'p1', mimeType: 'image/jpeg' } } },
      { id: 'c', op: 'worklog.note', entityId: 'e1', state: 'retry', createdAt: 1, payload: { params: { entryId: 'e1' }, body: { id: 'n1', body: 'dup of server' } } },
    ] as unknown as OutboxOp[];
    const server = [{ id: 'n1', body: 'Arrived', at: '2026-09-14T08:00:00Z', attachments: [] }] as never;
    const view = worklogView(server, 'e1', ops, (id: string) => `file:///doc/${id}.jpg`);
    expect(view.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(view[0]).toMatchObject({ body: 'Arrived', pendingSync: true, attachments: [{ id: 'p1', url: 'file:///doc/p1.jpg' }] });
    expect(view[1]).toMatchObject({ body: 'On the roof', pendingSync: true });
  });
});
