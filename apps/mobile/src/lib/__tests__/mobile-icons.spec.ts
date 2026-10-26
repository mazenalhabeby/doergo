import * as fs from 'fs';
import * as path from 'path';

/*
  The phone draws ONE icon set — the shared library the web draws (2026-10-26, phone-icons board): `<Icon>` and
  `<InkIcon>` in components/amazen/ink-icon.tsx. Ionicons and MaterialCommunityIcons were a second and third
  language; this keeps them out.
*/
const ROOT = path.resolve(__dirname, '../../..');

function files(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) return f === '__tests__' || f === 'node_modules' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe('the phone icon set', () => {
  it('imports no icon font', () => {
    const offenders = [...files(path.join(ROOT, 'src')), ...files(path.join(ROOT, 'app'))].filter((f) =>
      /from '@expo\/vector-icons'|require\('@expo\/vector-icons'\)/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
