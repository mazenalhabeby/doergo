/**
 * A step form answered with no signal: the photos and the signature are kept
 * and queued as the job's attachments in its lane, and the move behind them
 * carries their ids and waits for them — then all of it goes, in that order.
 */
import { SyncEngine, type SyncTransport, type RecordsSink } from '../../offline/sync-engine';
import { MemoryOutboxStore } from '../../offline/outbox/memory-store';
import { MemoryFileRegistry } from '../../offline/files/sqlite-file-registry';
import { OfflineFiles } from '../../offline/files/offline-files';
import { FileUploadPreparer } from '../../offline/files/upload-preparer';
import type { FileDisk } from '../../offline/files/types';
import type { OutboxOp } from '../../offline/outbox/types';
import type { StepForm } from '@hbcfield/shared/client';

jest.mock('../../offline/ids', () => {
  let n = 0;
  return { uuidv7: () => `0190f3c2-7b1a-7c3d-9e4f-c${String(++n).padStart(11, '0')}` };
});
/* eslint-disable @typescript-eslint/no-require-imports */
const { addTaskPhoto, changeTaskStatus } = require('../../offline/tasks/task-actions') as typeof import('../../offline/tasks/task-actions');
const { prepareStepForm } = require('../../features/job/step-form-logic') as typeof import('../../features/job/step-form-logic');
/* eslint-enable @typescript-eslint/no-require-imports */

function setup(online: () => boolean) {
  const sent: OutboxOp[] = [];
  const transport: SyncTransport = {
    async push(ops) {
      if (!online()) throw new Error('Network request failed');
      sent.push(...ops);
      return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' })) as never };
    },
    async pull() { throw new Error('unused'); },
  };
  const registry = new MemoryFileRegistry();
  const disk: FileDisk & { uriFor(id: string, mime: string): string } = {
    uriFor: (id) => `file:///doc/${id}`,
    async keep(i) { return { path: `file:///doc/${i.id}`, bytes: 800, mime: i.mime === 'image/png' ? 'image/png' : 'image/jpeg' }; },
    async remove() {},
  };
  const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };
  let n = 0;
  let t = 1_757_849_000_000;
  const e = new SyncEngine({
    userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), transport, records, now: () => t, random: () => 0.5,
    newId: () => `op-${++n}`,
    preparer: new FileUploadPreparer({
      files: registry, disk,
      uploader: { async presign() { return { uploadUrl: 'u', fileKey: 'o1/tasks/t1/k' }; }, async put() {} },
    }),
  });
  const settle = e.enqueueAndSettle.bind(e);
  e.enqueueAndSettle = (input) => settle(input, 5);
  return { e, files: new OfflineFiles({ registry, disk }), sent, later: (ms: number) => (t += ms) };
}

const form: StepForm = {
  version: 2,
  fields: [
    { id: 'pod', type: 'photos', label: 'Proof of delivery', required: true },
    { id: 'who', type: 'name', label: 'Received by', required: true },
    { id: 'sig', type: 'signature', label: 'Recipient signature', required: true },
  ],
};

describe('a step form, offline', () => {
  it('queues the files first in the job\'s lane; the move carries their ids and waits for them', async () => {
    let up = false;
    const s = setup(() => up);
    await s.e.start();

    const prepared = await prepareStepForm({
      form,
      draft: { pod: [{ uri: 'file:///cache/a.jpg', fileName: 'a.HEIC', mimeType: 'image/heic' }], who: 'Anna', sig: true },
      signatures: { sig: 'data:image/png;base64,SIG' },
      sent: new Map(),
      send: async (file) => {
        const r = await addTaskPhoto(s.e, s.files, {
          taskId: 't1', fileName: file.fileName, mime: file.mimeType,
          ...(file.uri.startsWith('data:') ? { base64: file.uri, kind: 'signature' as const } : { uri: file.uri }),
        });
        return { id: r.id, waitFor: r.state === 'done' ? null : r.opId, outcome: r.outcome };
      },
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const outcome = await changeTaskStatus(s.e, { taskId: 't1', from: 'ON_WAY', to: 'DELIVERED', answers: prepared.answers, dependsOn: prepared.dependsOn });
    expect(outcome.kind).toBe('queued');

    const ops = s.e.operations();
    const files = ops.filter((o) => o.op === 'task.attachment');
    const move = ops.find((o) => o.op === 'task.status')!;
    expect(files).toHaveLength(2);
    expect(files.every((o) => o.lane === 'task:t1')).toBe(true);
    expect(move.lane).toBe('task:t1');
    expect(move.dependsOn).toEqual(files.map((o) => o.id));

    const fileIds = files.map((o) => (o.payload.body as { id: string }).id);
    expect((move.payload.body as { answers: unknown }).answers).toEqual({ pod: [fileIds[0]], who: 'Anna', sig: fileIds[1] });
    // The signature is the pad's PNG, kept as a signature.
    expect((files[1]!.payload.body as { fileType: string }).fileType).toBe('image/png');

    up = true;
    s.later(60_000);
    await s.e.flush();
    const order = s.sent.map((o) => o.op);
    expect(order.indexOf('task.status')).toBeGreaterThan(order.lastIndexOf('task.attachment'));
  });
});
