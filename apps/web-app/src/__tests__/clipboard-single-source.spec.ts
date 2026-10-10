import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/*
  Every copy goes through `copyText` (lib/clipboard.ts), which reports a
  refused copy. A bare `navigator.clipboard.writeText` followed by "Copied"
  told the reader a code or temporary password was copied when it was not.
*/
const SRC = join(__dirname, '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '__tests__') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/\.spec\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

it('navigator.clipboard is used only by lib/clipboard.ts', () => {
  const offenders = walk(SRC)
    .filter((f) => /navigator\.clipboard/.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => relative(SRC, f))
    .filter((f) => f !== join('lib', 'clipboard.ts'));
  expect(offenders).toEqual([]);
});

it('JSON-LD is inlined only through the escaping helper', () => {
  const offenders = walk(SRC)
    .filter((f) => /application\/ld\+json/.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => relative(SRC, f))
    .filter((f) => f !== join('components', 'seo', 'json-ld.tsx'));
  expect(offenders).toEqual([]);
});
