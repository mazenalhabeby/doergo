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
    const code = stripComments(fs.readFileSync(path.join(MOBILE, 'src/lib/ocr.ts'), 'utf8'));
    expect(code).toContain('requireOptionalNativeModule');
    // The throwing form must never appear here.
    expect(code).not.toMatch(/requireNativeModule\s*</);
  });

  it('binds in exactly ONE file', () => {
    /*
      It was three. `card-scan.ts` and `receipt-scan.ts` each carried their own
      binding and capability cache, identical down to the comments — three
      chances to get wrong the one thing that crashes a screen for every
      existing user over the air, and three places to fix it when it is.

      The rule did not change when it moved; its home did. A second binding
      appearing anywhere is the drift this catches.

      Keyed on the READER's module name: other optional native modules (Play
      in-app updates) use the same safe API for their own binding, legitimately.
    */
    const binders = files
      .filter((f) => stripComments(fs.readFileSync(f, 'utf8')).includes("'ExpoMlkitOcr'"))
      .map((f) => path.relative(MOBILE, f));
    expect(binders).toEqual(['src/lib/ocr.ts']);
  });

  it('reports "cannot scan" rather than throwing when the module is absent', () => {
    // Jest has no native module, so this exercises the real absent case.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { canScanCards } = require('../card-scan');
    expect(() => canScanCards()).not.toThrow();
    expect(canScanCards()).toBe(false);
  });
});


/**
 * What the scanner must never do with somebody's card.
 *
 * The whole argument for reading the card on the device is that the card does
 * not travel. Leaving the photograph in a cache directory, or logging what was
 * read, quietly undoes that — and a business card is a named person's phone
 * number and email address, which is exactly the data this product is
 * otherwise careful with.
 */
describe('the scanner keeps the card on the phone', () => {
  const scan = fs.readFileSync(path.join(MOBILE, 'app/(app)/scan-card.tsx'), 'utf8');
  const lib = fs.readFileSync(path.join(MOBILE, 'src/lib/card-scan.ts'), 'utf8');

  /*
    ⚠️ THE WHOLE FEATURE, not just the screen.

    This used to read two files, because the review WAS the screen: one
    component held the camera, the fields and the save. It no longer is — the
    field row, the destination choice, the duplicate check and the two save
    roads are components of their own — and a guard that keeps reading the two
    files it was written against is a guard that quietly stops guarding. An
    upload added to `card-destination.tsx` would have passed it.

    Everything the scanner is made of is listed here, so a new part of the
    feature is either on this list or is not part of the feature.
  */
  const REVIEW = fs
    .readdirSync(path.join(MOBILE, 'src/components/customer'))
    .filter((f) => f.startsWith('card-'))
    .map((f) => path.join('src/components/customer', f));
  const FEATURE = ['app/(app)/scan-card.tsx', 'src/lib/card-scan.ts', ...REVIEW];
  const code = FEATURE.map((f) => stripComments(fs.readFileSync(path.join(MOBILE, f), 'utf8'))).join('\n');

  it('reads every part of the scanner (a shrinking file list passes anything)', () => {
    // The review is four components plus the rules they share. If a rename
    // drops them out of the scan, this says so rather than passing silently.
    expect(REVIEW.length).toBeGreaterThanOrEqual(4);
  });

  it('deletes the photograph, including when reading it failed', () => {
    expect(code).toMatch(/\.delete\(\)/);
    // In `finally`, not on the happy path — a failed read leaves a photo too.
    const finallyBlock = scan.slice(scan.indexOf('} finally {'));
    expect(finallyBlock).toContain('delete()');
  });

  it('never logs what was read', () => {
    // A card in a log file is the same disclosure as a card in a cache.
    expect(code).not.toMatch(/console\.(log|warn|info|debug)/);
  });

  it('sends the card nowhere except the record it creates', () => {
    /*
      No uploads, no analytics, no second endpoint — and the endpoints it DOES
      reach are named, with what each is for:

       · `create`     — the client a company's card becomes.
       · `addContact` — the contact person a person's card becomes, attached to
                        a company that is already in the book. Its own route
                        because a contact is not a client and must never be
                        billed as one.
       · `list`       — READS, both of them: the company the reader named, and
                        the duplicate check before saving. A search term is the
                        only thing that leaves the phone, and only a name the
                        member is about to save anyway.

      Anything else appearing here is the card travelling somewhere it was
      promised it would not.
    */
    expect(code).not.toMatch(/fetch\(/);
    const reached = [...new Set(code.match(/customersApi\.\w+/g) ?? [])].sort();
    expect(reached).toEqual(['customersApi.addContact', 'customersApi.create', 'customersApi.list']);
  });

  it('offers no field it will not save (the bug this screen was rebuilt for)', () => {
    /*
      The reader extracts eight fields; the screen used to save four and bin the
      rest, so a WEBSITE turned up in the contact-person box and a job title was
      corrected by hand and then dropped. `cardFieldsFor` decides what is shown,
      `homelessFields` is its complement, and the screen must render both — one
      as rows, the other as the sentence saying what has nowhere to go.
    */
    const review = stripComments(fs.readFileSync(path.join(MOBILE, 'app/(app)/scan-card.tsx'), 'utf8'));
    expect(review).toContain('cardFieldsFor');
    expect(review).toContain('homelessFields');
    const { cardFieldsFor, homelessFields, CARD_FIELDS } = require('../../components/customer/card-review');
    const everything = Object.fromEntries(CARD_FIELDS.map((k: string) => [k, 'x'])) as Record<string, string>;
    for (const [kind, destination] of [['COMPANY', 'client'], ['PERSON', 'client'], ['PERSON', 'contact']] as const) {
      const shown: string[] = cardFieldsFor(kind, destination);
      const orphans: string[] = homelessFields(kind, destination, everything);
      // Between them they account for every field the reader can produce, so
      // nothing can fall between the two and be silently discarded.
      expect([...shown, ...orphans].sort()).toEqual([...CARD_FIELDS].sort());
    }
  });

  it('asks the native module its capability once, not on every render', () => {
    // `isSupported()` crosses the bridge and this is called from a list
    // screen's render path; the answer cannot change mid-session.
    const reader = stripComments(fs.readFileSync(path.join(MOBILE, 'src/lib/ocr.ts'), 'utf8'));
    expect(reader).toMatch(/let supported: boolean \| null = null/);
    expect(reader).toMatch(/if \(supported !== null\) return supported/);
  });

  it('refuses the screen to anyone who may not add a client', () => {
    // The server refuses the save anyway; this stops somebody photographing a
    // card and correcting five fields before finding that out.
    expect(scan).toMatch(/crmCreateClients/);
    expect(scan).toMatch(/if \(!canAdd\)/);
  });
});
