import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Pagination meta is built by the shared `paginated()` — four services built
 * `totalPages: Math.ceil(total / limit)` by hand, one rounding rule away from
 * disagreeing about how many pages there are.
 */
describe('pagination meta comes from paginated()', () => {
  const SRC = join(__dirname, '..', '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) return e === '__tests__' ? [] : walk(full);
      return full.endsWith('.ts') ? [full] : [];
    });

  it('no service computes totalPages itself', () => {
    const offenders = walk(SRC).filter((f) => /totalPages:\s*Math\.ceil/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
