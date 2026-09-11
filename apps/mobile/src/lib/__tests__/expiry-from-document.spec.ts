import fs from 'fs';
import path from 'path';

/*
  ⚠️ THE DATE COMES OFF THE DOCUMENT. It was reported as "you did not remove the
  expires-on input" — correctly: both surfaces had the reading wired and both
  still LED with the picker, because the block rendered on `!!type.hasExpiry`
  alone. That is true the moment a type is chosen, before any file exists, so
  the first thing on screen was an empty date field for a date printed on the
  document about to be uploaded. Pre-filling it afterwards does not undo that.

  These scan the source rather than render, because what broke was the ORDER
  the screen decides in, and that is visible in the condition itself.
*/

const MOBILE = path.join(__dirname, '../../..');
const WEB = path.join(MOBILE, '../web-app');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SHEET = path.join(MOBILE, 'src/components/supply-document-sheet.tsx');
const DIALOG = path.join(
  WEB,
  'src/app/(dashboard)/my/documents/_components/supply-document-dialog.tsx',
);
const SURFACES: [string, string][] = [['mobile', SHEET], ['web', DIALOG]];

describe.each(SURFACES)('%s: the document is asked before the member is', (_name, file) => {
  const src = () => stripComments(fs.readFileSync(file, 'utf8'));

  it('decides through the shared rule, not its own condition', () => {
    // Two copies of "when do we ask for a date" is how one surface keeps the
    // old behaviour after the other is fixed — which is exactly what happened
    // to the pre-fill before this.
    expect(src()).toContain('expiryPrompt(');
  });

  it('never gates the expiry UI on the type alone', () => {
    // `needsDate = !!type?.hasExpiry` was the bug, in one line.
    expect(src()).not.toMatch(/needsDate\s*&&/);
    expect(src()).not.toMatch(/const needsDate\s*=/);
  });

  it('feeds the rule whether a file exists — the date comes from it', () => {
    expect(src()).toMatch(/hasFile:\s*!!(photo|file)/);
  });

  it('lets the member overrule what was read', () => {
    // Confident is not the same as right: a card photographed at an angle
    // produces a confident wrong answer.
    expect(src()).toContain('setOverriding(true)');
    expect(src()).toMatch(/overriding,?\s*\n?\s*\}\)/);
  });

  it('states a read date, and keeps the input for the ASK branch alone', () => {
    // FOUND renders a value with its provenance; ASK is the only branch that
    // puts a control in front of anybody.
    expect(src()).toMatch(/prompt\.state === ['"]FOUND['"]/);
    expect(src()).toMatch(/prompt\.state === ['"]ASK['"]/);
  });

  it('distinguishes a proven date from a guessed one', () => {
    // An MRZ expiry has a check digit behind it; a date scraped off printed
    // text is the latest one the page happened to show.
    expect(src()).toMatch(/certainty === ['"]PROVEN['"]/);
  });
});

describe('the strings both surfaces need exist in all five languages', () => {
  it.each(['en', 'de', 'es', 'fr', 'it'])('%s', (lang) => {
    for (const app of [MOBILE, WEB]) {
      const dict = JSON.parse(
        fs.readFileSync(path.join(app, `src/i18n/locales/${lang}.json`), 'utf8'),
      );
      const supply = dict.documents?.supply ?? {};
      const missing = [
        'expiresOn', 'expiresOnValue', 'changeDate', 'reading',
        'dateFromDocument', 'dateGuessed', 'dateNotFound', 'dateCorrecting',
      ].filter((k) => typeof supply[k] !== 'string');
      expect({ app: path.basename(app), lang, missing }).toEqual({
        app: path.basename(app), lang, missing: [],
      });
    }
  });

  it('the value line carries the date', () => {
    const en = JSON.parse(fs.readFileSync(path.join(MOBILE, 'src/i18n/locales/en.json'), 'utf8'));
    expect(en.documents.supply.expiresOnValue).toContain('{{date}}');
  });
});
