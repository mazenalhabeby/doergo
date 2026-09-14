/**
 * Photos taken offline: kept on the phone, uploaded when sent, deleted once accepted.
 */
import { SyncEngine, type SyncTransport, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { FileUploadPreparer } from '../files/upload-preparer';
import { MemoryFileRegistry } from '../files/sqlite-file-registry';
import { OfflineFiles } from '../files/offline-files';
import { UploadFailure, type FileDisk, type ObjectUploader } from '../files/types';
import { pendingAttachments, mergeAttachments } from '../tasks/overlay';
import { MIGRATIONS } from '../db/migrations';
import type { OutboxOp } from '../outbox/types';

jest.mock('../ids', () => {
  let n = 0;
  return { uuidv7: () => `0190f3c2-7b1a-7c3d-9e4f-a${String(++n).padStart(11, '0')}` };
});
jest.mock('../clock', () => ({ captureEvidence: () => undefined }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addTaskPhoto } = require('../tasks/task-actions') as typeof import('../tasks/task-actions');

let t = 1_757_849_000_000;
let n = 0;
const newId = () => `0190f3c2-7b1a-7c3d-9e4f-${String(++n).padStart(12, '0')}`;

function fakeDisk() {
  const bytes = new Map<string, number>();
  const disk: FileDisk & { uriFor(id: string, mime: string): string; bytes: Map<string, number> } = {
    bytes,
    async keep(input) {
      const path = `file:///doc/offline/u1/${input.id}.jpg`;
      bytes.set(path, 1234);
      return { path, bytes: 1234, mime: 'image/jpeg', width: 2048, height: 1536 };
    },
    async remove(path) {
      bytes.delete(path);
    },
    uriFor: (id) => `file:///doc/offline/u1/${id}.jpg`,
  };
  return disk;
}

function fakeUploader() {
  const calls: string[] = [];
  const uploader: ObjectUploader & { mode: 'ok' | 'offline' | 'forbidden' | 'putFails'; calls: string[] } = {
    mode: 'ok',
    calls,
    async presign(path) {
      calls.push(`presign ${path}`);
      if (this.mode === 'offline') throw new UploadFailure(null, 'NETWORK');
      if (this.mode === 'forbidden') throw new UploadFailure(403, 'MODULE_DISABLED');
      return { uploadUrl: 'https://s3/put', fileKey: 'org_1/attachments/t1/abc.jpg' };
    },
    async put(_url, path) {
      calls.push(`put ${path}`);
      if (this.mode === 'putFails') throw new UploadFailure(null, 'UPLOAD_FAILED');
    },
  };
  return uploader;
}

function fakeTransport() {
  const sent: OutboxOp[][] = [];
  const transport: SyncTransport & { offline: boolean } = {
    offline: false,
    async push(ops) {
      sent.push(ops);
      if (this.offline) throw new Error('Network request failed');
      return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' as const, body: {} })) };
    },
    async pull() {
      throw new Error('unused');
    },
  };
  return { transport, sent };
}

const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };

function setup() {
  const registry = new MemoryFileRegistry();
  const disk = fakeDisk();
  const uploader = fakeUploader();
  const { transport, sent } = fakeTransport();
  const store = new MemoryOutboxStore();
  const e = new SyncEngine({
    userId: 'u1', organizationId: 'o1', store, transport, records, newId, now: () => t, random: () => 0.5,
    preparer: new FileUploadPreparer({ files: registry, disk, uploader }),
  });
  const files = new OfflineFiles({ registry, disk, now: () => t });
  return { e, files, registry, disk, uploader, transport, sent, store };
}

/** enqueueAndSettle waits on a real timer when nothing settles — keep tests fast. */
const settleFast = (e: SyncEngine) => {
  const original = e.enqueueAndSettle.bind(e);
  e.enqueueAndSettle = (input) => original(input, 5);
};

describe('photos offline', () => {
  beforeEach(() => {
    t = 1_757_849_000_000;
  });

  it('keeps a photo taken offline and uploads it, with a fresh link, when the network is back', async () => {
    const s = setup();
    settleFast(s.e);
    await s.e.start();
    s.uploader.mode = 'offline';
    const { id, outcome } = await addTaskPhoto(s.e, s.files, { taskId: 't1', fileName: 'boiler.HEIC', mime: 'image/heic', uri: 'file:///cache/x.heic', width: 4032, height: 3024 });
    await s.e.flush();

    expect(outcome.kind).toBe('queued');
    expect(s.sent).toHaveLength(0); // nothing is confirmed before the photo is up
    expect(s.registry.rows.get(id)).toMatchObject({ state: 'kept' });
    const op = s.e.operations()[0]!;
    expect(op).toMatchObject({ state: 'retry', lastError: { code: 'NETWORK' } });
    expect(op.payload.body).toMatchObject({ id, fileName: 'boiler.jpg', fileType: 'image/jpeg' });

    // The screen shows the held copy meanwhile.
    const held = pendingAttachments('t1', s.e.operations(), s.files.uriFor.bind(s.files));
    expect(held).toEqual([expect.objectContaining({ id, fileUrl: `file:///doc/offline/u1/${id}.jpg`, pendingSync: true })]);

    s.uploader.mode = 'ok';
    t += 5_000;
    await s.e.flush();

    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]![0]!.payload.body).toMatchObject({ id, fileKey: 'org_1/attachments/t1/abc.jpg', fileSize: 1234 });
    expect(s.e.operations()[0]!.state).toBe('done');
    // Accepted: the phone's copy is gone.
    expect(s.registry.rows.size).toBe(0);
    expect(s.disk.bytes.size).toBe(0);
  });

  it('does not upload twice when the confirm fails after the upload', async () => {
    const s = setup();
    await s.e.start();
    const { id } = await s.files.keep({ id: 'a-photo-id-000000001', kind: 'photo', mime: 'image/jpeg', uri: 'file:///cache/a.jpg' }).then((f) => ({ id: f.id }));
    s.transport.offline = true;
    await s.e.enqueue({ op: 'task.attachment', lane: 'task:t1', entityId: 't1', payload: { params: { taskId: 't1' }, body: { id, fileName: 'a.jpg', fileType: 'image/jpeg' } } });
    await s.e.flush();
    expect(s.uploader.calls.filter((c) => c.startsWith('put'))).toHaveLength(1);
    expect(s.registry.rows.get(id)).toMatchObject({ state: 'uploaded', objectKey: 'org_1/attachments/t1/abc.jpg' });

    s.transport.offline = false;
    t += 5_000;
    await s.e.flush();
    expect(s.uploader.calls.filter((c) => c.startsWith('put'))).toHaveLength(1);
    expect(s.e.operations()[0]!.state).toBe('done');
  });

  it('holds the lane behind a photo that could not be uploaded, so notes stay in order', async () => {
    const s = setup();
    await s.files.keep({ id: 'b-photo-id-000000001', kind: 'photo', mime: 'image/jpeg', uri: 'file:///cache/b.jpg' });
    // Queued together (say, overnight in a basement), so they arrive in ONE batch.
    const base = { userId: 'u1', organizationId: 'o1', dependsOn: [], state: 'pending' as const, attempts: 0, updatedAt: t };
    const photo: OutboxOp = { ...base, id: 'op-1-photo-0000000001', op: 'task.attachment', lane: 'task:t1', entityId: 't1', createdAt: t, payload: { params: { taskId: 't1' }, body: { id: 'b-photo-id-000000001', fileName: 'b.jpg', fileType: 'image/jpeg' } } };
    const note: OutboxOp = { ...base, id: 'op-2-note-00000000001', op: 'task.comment', lane: 'task:t1', entityId: 't1', createdAt: t + 1, payload: { params: { taskId: 't1' }, body: { content: 'after the photo' } } };
    const dependent: OutboxOp = { ...base, id: 'op-3-dep-000000000001', op: 'task.comment', lane: 'task:t3', entityId: 't3', createdAt: t + 2, dependsOn: [photo.id], payload: { params: { taskId: 't3' }, body: { content: 'needs the photo' } } };
    const elsewhere: OutboxOp = { ...base, id: 'op-4-other-0000000001', op: 'task.comment', lane: 'task:t2', entityId: 't2', createdAt: t + 3, payload: { params: { taskId: 't2' }, body: { content: 'other job' } } };
    await s.store.save([photo, note, dependent, elsewhere]);
    await s.e.start();
    s.uploader.mode = 'putFails';
    await s.e.flush();

    const byId = Object.fromEntries(s.e.operations().map((o) => [o.id, o]));
    expect(byId[photo.id]!.state).toBe('retry');
    expect(byId[note.id]).toMatchObject({ state: 'pending', attempts: 0 });
    expect(byId[dependent.id]).toMatchObject({ state: 'pending', attempts: 0 });
    expect(byId[elsewhere.id]!.state).toBe('done');
    expect(s.sent.flat().map((o) => o.id)).toEqual([elsewhere.id]);

    s.uploader.mode = 'ok';
    t += 5_000;
    await s.e.flush();
    const order = s.sent.flat().map((o) => o.id);
    expect(order.indexOf(photo.id)).toBeLessThan(order.indexOf(note.id));
    expect(s.e.operations().every((o) => o.state === 'done')).toBe(true);
  });

  it('refuses a photo the member may not add, tells them, and deletes the copy', async () => {
    const s = setup();
    settleFast(s.e);
    await s.e.start();
    s.uploader.mode = 'forbidden';
    const { outcome } = await addTaskPhoto(s.e, s.files, { taskId: 't1', fileName: 'x.jpg', mime: 'image/jpeg', uri: 'file:///cache/x.jpg' });
    expect(outcome).toMatchObject({ kind: 'refused', code: 'MODULE_DISABLED' });
    expect(s.sent).toHaveLength(0);
    expect(s.registry.rows.size).toBe(0);
    expect(s.disk.bytes.size).toBe(0);
  });

  it('fails an operation whose file is gone instead of retrying forever', async () => {
    const s = setup();
    await s.e.start();
    await s.e.enqueue({ op: 'task.attachment', lane: 'task:t1', entityId: 't1', payload: { params: { taskId: 't1' }, body: { id: 'gone-photo-000000001', fileName: 'g.jpg', fileType: 'image/jpeg' } } });
    await s.e.flush();
    expect(s.e.operations()[0]).toMatchObject({ state: 'failed', lastError: { code: 'FILE_MISSING' } });
  });

  it('shows a photo once when the server already has it', () => {
    const merged = mergeAttachments([{ id: 'p1', fileUrl: 'https://signed' }], [
      { id: 'p1', fileName: '', fileType: 'image/jpeg', fileUrl: 'file:///p1.jpg', createdAt: '', pendingSync: true },
      { id: 'p2', fileName: '', fileType: 'image/jpeg', fileUrl: 'file:///p2.jpg', createdAt: '', pendingSync: true },
    ]);
    expect(merged.map((a) => a.fileUrl)).toEqual(['https://signed', 'file:///p2.jpg']);
  });

  it('adds the upload key column in a new migration step, never by editing the first', () => {
    expect(MIGRATIONS[0]).not.toContain('object_key');
    expect(MIGRATIONS[1]).toContain('ALTER TABLE files ADD COLUMN object_key');
  });
});
