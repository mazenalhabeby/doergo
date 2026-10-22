import * as fs from 'fs';
import * as path from 'path';

/**
 * One way to name a file in the app (6.4): its own folder by `./`, a neighbour by `../`, anything
 * further by the `@/` alias (`src/`). `../../../lib/x` changed every time a screen moved — 6.1
 * moved 448 files, and every climbing import had to be rewritten. The alias does not move.
 */
const MOBILE = path.resolve(__dirname, '../../..');
const SRC = path.join(MOBILE, 'src');
const IMPORT = /(?:from|import\(|require\(|jest\.mock\()\s*['"]((?:\.\.\/){2,}[^'"]*)['"]/g;
const EXT = ['', '.ts', '.tsx', '/index.ts', '/index.tsx', '.js', '.json'];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('imports', () => {
  const files = [...walk(SRC), ...walk(path.join(MOBILE, 'app'))];

  it('walks the app (an empty walk would pass anything)', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('reach into src/ by @/, never by climbing two or more folders', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(IMPORT)) {
        const target = path.resolve(path.dirname(f), m[1]!);
        const inSrc = target.startsWith(SRC + path.sep);
        if (inSrc && EXT.some((e) => fs.existsSync(target + e))) offenders.push(`${path.relative(MOBILE, f)}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
