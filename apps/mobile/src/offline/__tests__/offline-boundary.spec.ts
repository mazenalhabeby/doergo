import * as fs from 'fs';
import * as path from 'path';

/**
 * The offline layer sits UNDER the screens: features use it, it never uses a feature. It reached
 * into the home screen's folder for the remembered-answers store, which is why that store now lives
 * in `lib/remember/` (6.2) — a store every widget, the offline layer and sign-out all read.
 */
const OFFLINE = path.resolve(__dirname, '..');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('the offline layer', () => {
  it('walks its files (an empty walk would pass anything)', () => {
    expect(walk(OFFLINE).length).toBeGreaterThan(50);
  });

  it('never imports a feature', () => {
    const offenders = walk(OFFLINE).filter((f) =>
      /from\s+['"](?:@\/features\/|(?:\.\.\/)+features\/)/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => path.relative(OFFLINE, f))).toEqual([]);
  });
});
