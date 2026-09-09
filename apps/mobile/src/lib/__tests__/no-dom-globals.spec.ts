import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Browser globals do not exist on a phone, and TypeScript will not say so.
 *
 * ⚠️ `expo/tsconfig.base` sets `lib: ["DOM", "ESNext"]`. That makes `screen`,
 * `document` and friends perfectly good globals as far as the compiler is
 * concerned, so `tsc --noEmit` passes clean on a screen that cannot open.
 *
 * It happened. `const screen = useWindowDimensions()` was renamed to `window`
 * when the card scanner started measuring against the camera's own box, and one
 * use — a dependency array — was not renamed with it:
 *
 *     }, [busy, t, toast, frame, screen.width, screen.height]);
 *
 * Types passed. Every test passed. Opening the scanner threw "Property 'screen'
 * doesn't exist" before a single frame was drawn, and it shipped in a build
 * handed to somebody to test.
 *
 * So the check is textual, because the type system is the thing that failed.
 */

const ROOTS = [join(__dirname, '..', '..'), join(__dirname, '..', '..', '..', 'app')];

/**
 * Globals that lib.DOM declares and React Native does not provide.
 *
 * `window` is deliberately absent: it is a legitimate LOCAL name here (the
 * result of `useWindowDimensions`), and flagging it would train people to add
 * exemptions. `navigator` is absent too — React Native provides a partial one.
 */
const ABSENT_ON_A_PHONE = ['screen', 'document', 'localStorage', 'sessionStorage'];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Comments and strings hold the word "screen" constantly; only code counts. */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');

describe('no browser globals in the mobile app', () => {
  const files = ROOTS.flatMap(sourceFiles);

  it('finds the app to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(ABSENT_ON_A_PHONE)('nothing reads the browser %s', (name) => {
    /*
      `\bname\.` catches the use that broke the scanner. Deliberately NOT
      matching `name:` (a property key — `frameToImageCrop({ screen: box })` is
      correct and must stay legal) nor `.name` (a member of something else).
    */
    const use = new RegExp(`(^|[^.\\w])${name}\\s*\\.`);
    const offenders: string[] = [];

    for (const f of files) {
      const src = strip(readFileSync(f, 'utf8'));
      // A local of the same name makes it legal in that file.
      const declared = new RegExp(`(const|let|var|function)\\s+${name}\\b`).test(src);
      if (declared) continue;
      for (const [i, line] of src.split('\n').entries()) {
        if (use.test(line)) offenders.push(`${f.split('/apps/mobile/')[1]}:${i + 1}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
