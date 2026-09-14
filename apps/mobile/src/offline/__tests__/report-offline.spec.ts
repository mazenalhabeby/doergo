/**
 * Completing a job with its report and photos, with no signal.
 */
import { SyncEngine, type SyncTransport, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { MemoryFileRegistry } from '../files/sqlite-file-registry';
import { OfflineFiles } from '../files/offline-files';
import { FileUploadPreparer } from '../files/upload-preparer';
import { selectBatch } from '../outbox/scheduler';
import { overlayTask } from '../tasks/overlay';
import { UploadFailure, type FileDisk } from '../files/types';
import type { OutboxOp } from '../outbox/types';

jest.mock('../ids', () => {
  let n = 0;
  return { uuidv7: () => `0190f3c2-7b1a-7c3d-9e4f-c${String(++n).padStart(11, '0')}` };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { completeTaskWithReport } = require('../tasks/task-actions') as typeof import('../tasks/task-actions');

function setup(respond: (op: OutboxOp) => { status: 'applied' | 'rejected'; code?: string } | 'offline') {
  const presigned: string[] = [];
  const sent: OutboxOp[] = [];
  const transport: SyncTransport = {
    async push(ops) {
      const answers = ops.map((o) => [o, respond(o)] as const);
      if (answers.some(([, a]) => a === 'offline')) throw new Error('Network request failed');
      sent.push(...ops);
      return { ok: true, results: answers.map(([o, a]) => ({ id: o.id, ...(a as object) })) as never };
    },
    async pull() {
      throw new Error('unused');
    },
  };
  const registry = new MemoryFileRegistry();
  const removed: string[] = [];
  const disk: FileDisk & { uriFor(id: string, mime: string): string } = {
    async keep(i) {
      return { path: `file:///doc/${i.id}.jpg`, bytes: 800, mime: 'image/jpeg' };
    },
    async remove(path) {
      removed.push(path);
    },
    uriFor: (id) => `file:///doc/${id}.jpg`,
  };
  const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };
  let n = 0;
  let t = 1_757_849_000_000;
  const e = new SyncEngine({
    userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), transport, records, now: () => t, random: () => 0.5,
    newId: () => `op-${++n}`,
    preparer: new FileUploadPreparer({
      files: registry, disk,
      uploader: {
        async presign(path) {
          // Like the server: no link for a report it does not have yet.
          const reportId = path.split('/')[2];
          if (!sent.some((o) => o.op === 'task.complete' && (o.payload.body as { id: string }).id === reportId)) {
            throw new UploadFailure(404, 'REPORT_NOT_FOUND');
          }
          presigned.push(path);
          return { uploadUrl: 'u', fileKey: 'o1/reports/r/k.jpg' };
        },
        async put() {},
      },
    }),
  });
  const settle = e.enqueueAndSettle.bind(e);
  e.enqueueAndSettle = (input) => settle(input, 5);
  return { e, files: new OfflineFiles({ registry, disk }), registry, removed, presigned, sent, later: (ms: number) => (t += ms) };
}

const report = { summary: 'Nozzle replaced', workDuration: 2100, technicianSignature: 'data:image/png;base64,AAA', customerSignature: 'data:image/png;base64,BBB', customerName: 'Anna' };
const photo = (side: 'BEFORE' | 'AFTER') => ({ uri: `file:///cache/${side}.jpg`, fileName: `${side}.HEIC`, mimeType: 'image/heic', side });

describe('completing a job offline', () => {
  it('queues the report, then each photo behind it in the same lane, and shows the job completed', async () => {
    let online = false;
    const s = setup((o) => (online ? { status: 'applied' } : 'offline'));
    await s.e.start();
    const { reportId, outcome } = await completeTaskWithReport(s.e, s.files, { taskId: 't1', report, photos: [photo('BEFORE'), photo('AFTER')] });
    expect(outcome.kind).toBe('queued');

    const [complete, before, after] = s.e.operations();
    expect(complete).toMatchObject({ op: 'task.complete', lane: 'task:t1', payload: { body: { id: reportId, customerName: 'Anna', evidence: { occurredAt: expect.any(String) } } } });
    expect(before).toMatchObject({ op: 'report.attachment', lane: 'task:t1', dependsOn: [complete!.id], payload: { params: { reportId }, body: { type: 'BEFORE', fileName: 'BEFORE.jpg', fileType: 'image/jpeg' } } });
    expect(after!.payload.body).toMatchObject({ type: 'AFTER' });
    expect(overlayTask({ id: 't1', status: 'IN_PROGRESS' }, s.e.operations()).status).toBe('COMPLETED');

    online = true;
    s.later(60_000);
    await s.e.flush();
    expect(s.sent.map((o) => o.op)).toEqual(['task.complete', 'report.attachment', 'report.attachment']);
    expect(s.presigned).toEqual([`/reports/${reportId}/attachments/presign`, `/reports/${reportId}/attachments/presign`]);
    expect(s.registry.rows.size).toBe(0);
  });

  it('drops the kept photos when the server refuses the completion', async () => {
    const s = setup(() => ({ status: 'rejected', code: 'TASK_STATE_CONFLICT' }));
    await s.e.start();
    const { outcome } = await completeTaskWithReport(s.e, s.files, { taskId: 't1', report, photos: [photo('BEFORE')] });
    expect(outcome).toMatchObject({ kind: 'refused', code: 'TASK_STATE_CONFLICT' });
    expect(s.registry.rows.size).toBe(0);
    expect(s.removed).toHaveLength(1);
    expect(s.e.operations().some((o) => o.op === 'report.attachment')).toBe(false);
  });
});

describe('push size budget', () => {
  const op = (id: string, lane: string, bytes: number): OutboxOp => ({
    id, userId: 'u1', organizationId: 'o1', op: 'task.complete', lane, dependsOn: [], state: 'pending', attempts: 0,
    createdAt: Number(id.slice(1)), updatedAt: 0, payload: { body: { technicianSignature: 'x'.repeat(bytes) } },
  });

  it('stops filling a push at the budget, keeping order within a lane', () => {
    const ops = [op('a1', 'task:1', 3_000), op('a2', 'task:1', 3_000), op('a3', 'task:2', 10)];
    const { batch } = selectBatch(ops, 0, 50, 5_000);
    expect(batch.map((o) => o.id)).toEqual(['a1', 'a3']);
  });

  it('always sends the first operation, however large', () => {
    expect(selectBatch([op('a1', 'task:1', 9_000)], 0, 50, 5_000).batch).toHaveLength(1);
  });
});
