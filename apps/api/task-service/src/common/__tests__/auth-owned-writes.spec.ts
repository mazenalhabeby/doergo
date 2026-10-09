import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * `AccessRole` and `Organization` belong to auth-service. task-service writes
 * them in exactly two places, each documented at the write with why the write
 * cannot move (space roles commit with their assignments; the calendar's own
 * organization columns commit with the feed-token wipe). A third writer must
 * be added here with its reason — or go through auth-service.
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

  it('only the two documented writers', () => {
    const writers = walk(SRC)
      .filter((f) => WRITE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
      .sort();
    expect(writers).toEqual(['modules/calendar/holidays.service.ts', 'modules/space-roles/space-roles.service.ts']);
  });

  it.each([
    ['modules/calendar/holidays.service.ts', /A write to `Organization`, which auth-service owns/],
    ['modules/space-roles/space-roles.service.ts', /WHY THIS SERVICE WRITES `AccessRole`/],
  ])('%s says why at the write', (file, why) => {
    expect(readFileSync(join(SRC, file), 'utf8')).toMatch(why);
  });
});
