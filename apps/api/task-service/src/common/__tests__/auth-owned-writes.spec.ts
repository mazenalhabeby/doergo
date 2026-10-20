import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * `AccessRole` and `Organization` belong to auth-service. task-service writes
 * them in exactly three places, each documented at the write with why the write
 * cannot move (space roles commit with their assignments; the calendar's own
 * organization columns commit with the feed-token wipe; the leave ledger's
 * tracking-start day commits with the first starting balances). A third writer must
 * be added here with its reason — or go through auth-service.
 *
 * The space-roles MODULE is one writer: only merging/deleting a role stays here
 * (2026-10-20, group D); creating and editing go through auth-service.
 */
describe('task-service writes to auth-owned tables', () => {
  const SRC = join(__dirname, '..', '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) return e === '__tests__' ? [] : walk(full);
      return full.endsWith('.ts') ? [full] : [];
    });
  const WRITE = /\b(accessRole|organization)\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\(/;

  it('only the three documented writers', () => {
    const writers = walk(SRC)
      .filter((f) => WRITE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
      .map((f) => (f.startsWith('modules/space-roles/') ? 'modules/space-roles/' : f))
      .filter((f, i, all) => all.indexOf(f) === i)
      .sort();
    expect(writers).toEqual([
      'modules/calendar/holidays.service.ts',
      'modules/space-roles/',
      'modules/technicians/leave-opening.service.ts',
    ]);
  });

  it.each([
    ['modules/calendar/holidays.service.ts', /A write to `Organization`, which auth-service owns/],
    ['modules/space-roles/role-admin.service.ts', /WHY THIS SERVICE WRITES `AccessRole`/],
    ['modules/technicians/leave-opening.service.ts', /WHY THIS SERVICE WRITES `Organization`/],
  ])('%s says why at the write', (file, why) => {
    expect(readFileSync(join(SRC, file), 'utf8')).toMatch(why);
  });
});
