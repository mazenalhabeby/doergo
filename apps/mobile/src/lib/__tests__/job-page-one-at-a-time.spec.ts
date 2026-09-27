/**
 * One job at a time — said BEFORE the tap, and any refusal said on the page.
 * The job page is a modal screen and the island is drawn under it, so a
 * refusal there was invisible and the button looked dead (2026-09-27).
 */
import * as fs from 'fs';
import * as path from 'path';
import { slotHeldBy, ONE_AT_A_TIME_STATUSES } from '@hbcfield/shared/client';

const code = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8');

describe('the slot', () => {
  const me = 'u1';
  const job = (id: string, status: string, assignedToId = me) => ({ id, status, assignedToId, title: id });
  it('another of mine under way holds it; blocked, finished and others\' jobs do not', () => {
    expect(slotHeldBy('a', me, [job('a', 'ASSIGNED'), job('rewe', 'EN_ROUTE')])?.id).toBe('rewe');
    expect(slotHeldBy('a', me, [job('a', 'ASSIGNED'), job('b', 'BLOCKED'), job('c', 'COMPLETED'), job('d', 'IN_PROGRESS', 'u2')])).toBeNull();
    expect(slotHeldBy('a', me, [job('a', 'IN_PROGRESS')])).toBeNull(); // itself never blocks
  });
  it('the server reads the same list', () => {
    const server = fs.readFileSync(path.resolve(__dirname, '../../../../api/task-service/src/modules/tasks/tasks.service.ts'), 'utf8');
    expect(server).toMatch(/status: \{ in: \[\.\.\.ONE_AT_A_TIME_STATUSES\]/);
    expect([...ONE_AT_A_TIME_STATUSES]).toEqual(['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']);
  });
});

describe('said on the page', () => {
  it('accepting while the slot is held: the button waits and the dock names the job, with a way to it', () => {
    const page = code('components/job/job-page.tsx');
    expect(page).toMatch(/disabled: held \|\| !!slotHolder/);
    expect(page).toMatch(/t\('job\.oneAtATime'/);
  });
  it('every write failure reaches the dock, not only the island', () => {
    const writes = code('components/job/use-job-writes.ts');
    expect((writes.match(/toast\.error\(/g) ?? []).length).toBe(1); // only inside fail()
    expect(writes).toMatch(/setNotice\(body \|\| title\)/);
  });
});
