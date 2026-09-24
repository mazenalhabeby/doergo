/**
 * A named font face and a `fontWeight` must never appear in the same style.
 *
 * ⚠️ THE TWO PLATFORMS DISAGREE ABOUT WHAT THAT MEANS, SILENTLY.
 *
 *   Android  ignores `fontWeight` when `fontFamily` names a loaded face, and
 *            draws the face as it is.
 *   iOS      synthesises a faux bold on top of that face.
 *
 * So the same style renders at two different weights and neither platform
 * warns. It shipped in the home header: the member's name was Readex Pro
 * Medium on Android — which is what was measured against the design and
 * approved — and a faux-bold Medium on iOS.
 *
 * Readex Pro ships 200/300/400/500/600/700 as REAL faces. Wanting heavier text
 * means loading the face and naming it, never asking a weight for it.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');

/** The v2 layer, where the type scale is the law. */
const DIRS = ['components/amazen', 'components/glyphs', 'home'];

function files(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(full);
    }
  };
  for (const d of DIRS) walk(path.join(SRC, d));
  return out;
}

/** Strip comments — the first version of this test matched its own docs. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('no style asks for a weight the two platforms answer differently', () => {
  const all = files();

  it('finds the v2 layer', () => {
    expect(all.length).toBeGreaterThan(10);
  });

  it.each(all.map((f) => [path.relative(SRC, f), f]))('%s', (_name, file) => {
    const src = strip(fs.readFileSync(file, 'utf8'));

    /*
      Every `{ … }` object literal that sets BOTH. Crude on purpose: a style
      object is the only place these two keys meet, and a false positive costs
      one comment while a false negative costs a shipped divergence.
    */
    const offenders = [...src.matchAll(/\{[^{}]*\}/g)]
      .map((m) => m[0])
      .filter((o) => /fontFamily\s*:/.test(o) && /fontWeight\s*:/.test(o));

    expect(offenders).toEqual([]);
  });

  it('the type scale itself never sets a weight', () => {
    // Every variant names a face; a weight beside one would divide the app.
    const theme = strip(fs.readFileSync(path.join(SRC, 'theme/amazen.ts'), 'utf8'));
    const scale = theme.slice(theme.indexOf('display:'), theme.indexOf('} as const', theme.indexOf('display:')));
    expect(scale).not.toMatch(/fontWeight/);
  });

  it('the faces the app loads are the faces the tokens name', () => {
    const theme = fs.readFileSync(path.join(SRC, 'theme/amazen.ts'), 'utf8');
    const layout = fs.readFileSync(path.resolve(SRC, '../app/_layout.tsx'), 'utf8');
    const named = [...theme.matchAll(/'((?:ReadexPro|IBMPlexMono)_[A-Za-z0-9]+)'/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(3);
    const loaded = layout.slice(layout.indexOf('useFonts({'));
    for (const face of new Set(named)) expect(loaded).toContain(face);
  });
});
