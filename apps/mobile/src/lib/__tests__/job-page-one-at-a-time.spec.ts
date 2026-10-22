/**
 * One job at a time — said BEFORE the tap, and any refusal said on the page.
 * The job page is a modal screen and the island is drawn under it, so a
 * refusal there was invisible and the button looked dead (2026-09-27).
 */
import * as fs from 'fs';
import * as path from 'path';
import { slotHeldBy, ONE_AT_A_TIME_STATUSES } from '@hbcfield/shared/client';
import { readSource } from '@/test-utils/read-source';

// A split file reads with the parts moved out of it (test-utils/read-source.ts).
const code = (p: string) => readSource(path.resolve(__dirname, '../..', p), 'utf8');

describe('the slot', () => {
  const me = 'u1';
  const job = (id: string, status: string, assignedToId = me) => ({ id, status, assignedToId, title: id });
  it("another of mine under way holds it; blocked, finished and others' jobs do not", () => {
    expect(slotHeldBy('a', me, [job('a', 'ASSIGNED'), job('rewe', 'EN_ROUTE')])?.id).toBe('rewe');
    expect(
      slotHeldBy('a', me, [
        job('a', 'ASSIGNED'),
        job('b', 'BLOCKED'),
        job('c', 'COMPLETED'),
        job('d', 'IN_PROGRESS', 'u2'),
      ]),
    ).toBeNull();
    expect(slotHeldBy('a', me, [job('a', 'IN_PROGRESS')])).toBeNull(); // itself never blocks
  });
  it('the server reads the same list', () => {
    const server = fs.readFileSync(
      // The one-at-a-time check moved out of task-status.service.ts with the updateStatus split.
      path.resolve(__dirname, '../../../../api/task-service/src/modules/tasks/status/task-status-checks.ts'),
      'utf8',
    );
    expect(server).toMatch(/status: \{ in: \[\.\.\.ONE_AT_A_TIME_STATUSES\]/);
    expect([...ONE_AT_A_TIME_STATUSES]).toEqual(['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']);
  });
});

describe('said on the page', () => {
  it('accepting while the slot is held: the button waits and the dock names the job, with a way to it', () => {
    const page = code('features/job/job-page.tsx');
    expect(page).toMatch(/disabled: held \|\| !!slotHolder/);
    expect(page).toMatch(/t\('job\.oneAtATime'/);
  });
  it('every write failure reaches the dock, not only the island', () => {
    const writes = code('features/job/use-job-writes.ts');
    expect((writes.match(/toast\.error\(/g) ?? []).length).toBe(1); // only inside fail()
    expect(writes).toMatch(/setNotice\(body \|\| title\)/);
  });
});

describe('the direct status write sends only what the endpoint takes', () => {
  it('a full status fix (fixAt, mocked) is trimmed to lat, lng, accuracy', async () => {
    jest.resetModules();
    const calls: Array<{ url: string; body: unknown }> = [];
    jest.doMock('../api/client', () => ({
      E: jest.requireActual('@hbcfield/shared/client').apiEndpoints,
      call: jest.fn(async (def: { path: (a: unknown) => string }, args: unknown, opts: { body: unknown }) => {
        calls.push({ url: def.path(args), body: opts.body });
        return {};
      }),
    }));
    const { tasksApi } = require('../api/tasks');
    await tasksApi.updateStatus('t1', 'ARRIVED', undefined, {
      lat: 48.1,
      lng: 16.3,
      accuracy: 12,
      fixAt: '2026-09-27T09:00:00Z',
      mocked: false,
    } as never);
    expect(calls[0]!.url).toBe('/tasks/t1/status');
    // As JSON on the wire: `reason: undefined` is not sent.
    expect(JSON.parse(JSON.stringify(calls[0]!.body))).toEqual({
      status: 'ARRIVED',
      lat: 48.1,
      lng: 16.3,
      accuracy: 12,
    });
  });
});
