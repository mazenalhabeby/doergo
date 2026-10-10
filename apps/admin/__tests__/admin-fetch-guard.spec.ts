/**
 * Nothing in the console calls `fetch` but its API client (lib/api). A second
 * fetch is a second idea of what a 401 means, of the timeout, of where the
 * token may go — the copies this console was rebuilt to remove.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__']);
const ALLOWED = `lib${sep}api${sep}`;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return SKIP_DIRS.has(name) ? [] : files(full);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [full] : [];
  });
}

/** Comments out, so a sentence ABOUT fetch( is not a call. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('admin fetch guard', () => {
  const all = files(ROOT);

  it('scans the console', () => {
    expect(all.some((f) => f.endsWith(join('app', 'page.tsx')))).toBe(true);
  });

  it('finds no fetch( outside lib/api', () => {
    const offenders = all
      .filter((f) => !relative(ROOT, f).startsWith(ALLOWED))
      .filter((f) => /\bfetch\s*\(/.test(code(readFileSync(f, 'utf8'))))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('lib/api itself leaves fetch to the shared core', () => {
    const own = all.filter((f) => relative(ROOT, f).startsWith(ALLOWED));
    expect(own.length).toBeGreaterThan(0);
    for (const f of own) expect({ f: relative(ROOT, f), calls: /\bfetch\s*\(/.test(code(readFileSync(f, 'utf8'))) }).toEqual({ f: relative(ROOT, f), calls: false });
  });
});
