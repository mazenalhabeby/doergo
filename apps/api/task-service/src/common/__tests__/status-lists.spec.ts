import { readFileSync } from 'fs';
import { join } from 'path';
import { ACTIVE_STATUSES, TERMINAL_STATUSES, WORKING_NOW_STATUSES } from '@hbcfield/shared';

/**
 * Status lists come from shared, and a local list with a DIFFERENT meaning
 * does not borrow a shared name. The workspace presence panel kept two copies
 * called `ACTIVE_STATUSES` meaning "working right now" — the shared constant of
 * that name means "not finished".
 */
describe('task status lists', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', '..', f), 'utf8');

  it('"working now" is narrower than "not finished"', () => {
    for (const s of WORKING_NOW_STATUSES) expect(ACTIVE_STATUSES).toContain(s);
    expect(WORKING_NOW_STATUSES).not.toContain('ASSIGNED');
    expect(WORKING_NOW_STATUSES).not.toContain('NEW');
  });

  it('job time closes on the shared terminal list', () => {
    expect(read('modules/tasks/handover/job-time-helpers.ts')).toMatch(/CLOSED_KEYS: string\[\] = TERMINAL_STATUSES/);
    expect([...TERMINAL_STATUSES].sort()).toEqual(['CANCELED', 'CLOSED', 'COMPLETED']);
  });

  it('the presence panel keeps no local list under a shared name', () => {
    const src = read('modules/locations/space-roster.service.ts');
    expect(src).not.toMatch(/const ACTIVE_STATUSES/);
    expect(src).toMatch(/WORKING_NOW_STATUSES/);
  });
});
