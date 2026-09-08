import fs from 'fs';
import path from 'path';

/**
 * The card reader must never be imported at module scope.
 *
 * `expo-mlkit-ocr` binds to native code the moment it is imported:
 *
 *     export default requireNativeModule('ExpoMlkitOcr');
 *
 * `requireNativeModule` THROWS when the native side is absent, so a top-level
 * import takes the importing screen down before any capability check can run.
 *
 * The damage is not limited to development. This JavaScript reaches production
 * phones over the air, and their binaries predate the module — so a top-level
 * import would crash the customers screen for every existing user, in service
 * of a feature they cannot use yet.
 *
 * Nothing else catches this. It typechecks, it bundles, and it works perfectly
 * on the one machine that happens to have the native module.
 */
const MOBILE = path.join(__dirname, '../../..');
const OCR = 'expo-mlkit-ocr';

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

/** Code only — a comment naming the module is not an import of it. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the native card reader is never imported at module scope', () => {
  /*
    Excluding the tests themselves is not a loophole — it is required. This
    file names the package as CODE (`const OCR` above), so a scanner that reads
    it reports itself. That has now happened four times in this codebase with
    four different guards; stripping comments only fixes half of it.
  */
  const files = ['src', 'app']
    .flatMap((d) => sourceFiles(path.join(MOBILE, d)))
    .filter((f) => !f.includes('__tests__'));

  it('finds the app source (an empty scan would pass anything)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no file imports the reader package directly', () => {
    /*
      `expo-mlkit-ocr` binds at module scope with `requireNativeModule`, which
      throws when the native side is absent. Importing the package at all —
      top-level OR inside a require — raises an error that React Native then
      REPORTS, so the customers screen shows a red error on every render even
      when the throw is caught.
    */
    const offenders = files
      .filter((f) => {
        const code = stripComments(fs.readFileSync(f, 'utf8'));
        return code.includes(`'${OCR}'`) || code.includes(`"${OCR}"`);
      })
      .map((f) => path.relative(MOBILE, f));
    expect(offenders).toEqual([]);
  });

  it('binds through the OPTIONAL native API, which answers null instead of throwing', () => {
    const code = stripComments(fs.readFileSync(path.join(MOBILE, 'src/lib/card-scan.ts'), 'utf8'));
    expect(code).toContain('requireOptionalNativeModule');
    // The throwing form must never appear here.
    expect(code).not.toMatch(/requireNativeModule\s*</);
  });

  it('reports "cannot scan" rather than throwing when the module is absent', () => {
    // Jest has no native module, so this exercises the real absent case.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { canScanCards } = require('../card-scan');
    expect(() => canScanCards()).not.toThrow();
    expect(canScanCards()).toBe(false);
  });
});
