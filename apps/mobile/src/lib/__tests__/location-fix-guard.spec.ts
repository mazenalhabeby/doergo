/**
 * Every one-shot position goes through `getFix` (lib/location-fix.ts).
 *
 * A screen calling `getCurrentPositionAsync` itself is how a spinner ends up
 * waiting on a GPS with no deadline, and how two screens asking the same
 * question end up with different accuracies. The background tasks are not
 * one-shot fixes and keep their own calls.
 */
import * as fs from 'fs';
import * as path from 'path';

const MOBILE = path.resolve(__dirname, '../../..');
const ALLOWED = new Set(['src/lib/location-fix.ts']);
const BACKGROUND_TASK = /^src\/services\/background-[\w-]+\.ts$/;

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') yield* walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) yield full;
  }
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('one-shot location fixes', () => {
  it('are taken only through getFix', () => {
    const offenders: string[] = [];
    for (const root of ['app', 'src']) {
      for (const file of walk(path.join(MOBILE, root))) {
        const rel = path.relative(MOBILE, file).split(path.sep).join('/');
        if (ALLOWED.has(rel) || BACKGROUND_TASK.test(rel)) continue;
        const src = stripComments(fs.readFileSync(file, 'utf8'));
        if (/\b(getCurrentPositionAsync|getLastKnownPositionAsync)\b/.test(src)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
