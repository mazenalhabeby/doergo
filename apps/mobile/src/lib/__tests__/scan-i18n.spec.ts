import fs from 'fs';
import path from 'path';

/**
 * Every word the card scanner says, in all five languages.
 *
 * ⚠️ A missing key does not throw and does not look broken. `t('scan.x')`
 * renders "scan.x" — a literal dotted key on a review screen somebody is about
 * to save a client from — and the only person who ever sees it is the customer
 * whose phone is set to the one language nobody checked. The screen works
 * perfectly in English on the machine the feature was written on.
 *
 * So the keys are read out of the SOURCE rather than listed here. A key added
 * to the screen and forgotten in four locale files fails without this file
 * being edited, which is the only way a guard like this stays true.
 */
const MOBILE = path.join(__dirname, '../..', '..');
const LANGS = ['en', 'de', 'es', 'fr', 'it'] as const;

/** Where the scanner's own words are written. */
const SOURCES = [
  'app/(app)/scan-card.tsx',
  'src/components/customer/card-destination.tsx',
  'src/components/customer/card-duplicate.tsx',
  'src/components/customer/card-field-row.tsx',
];

/*
  ⚠️ Comments are stripped BEFORE scanning. These files explain themselves at
  length, and an example key inside a doc comment is not a key the screen ever
  renders — the first version of a guard like this in the web app matched its
  own documentation and had to be fixed twice.
*/
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function keysUsed(): string[] {
  const found = new Set<string>();
  for (const rel of SOURCES) {
    const file = path.join(MOBILE, rel);
    if (!fs.existsSync(file)) continue;
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    for (const m of code.matchAll(/['"`](scan\.[A-Za-z0-9_.]+)['"`]/g)) found.add(m[1]!);
  }
  return [...found].sort();
}

const dict = (lang: string) =>
  JSON.parse(fs.readFileSync(path.join(MOBILE, `src/i18n/locales/${lang}.json`), 'utf8')) as Record<string, unknown>;

const at = (data: unknown, key: string) =>
  key.split('.').reduce<unknown>((o, seg) => (o == null ? o : (o as Record<string, unknown>)[seg]), data);

describe('the card scanner speaks every language the app ships', () => {
  it('finds the keys the screens actually render', () => {
    const used = keysUsed();
    // A sanity floor: if the scan ever stops matching, it must not pass silently.
    expect(used.length).toBeGreaterThan(20);
    // The ones this change added, which is what makes the floor meaningful.
    expect(used).toEqual(expect.arrayContaining([
      'scan.createCompany', 'scan.createNamed', 'scan.createCompanyExplain',
      'scan.saveNewCompany', 'scan.needCompanyName', 'scan.maybeExistsCompany',
    ]));
  });

  it.each(LANGS)('has every one of them in %s', (lang) => {
    const data = dict(lang);
    const missing = keysUsed().filter((k) => typeof at(data, k) !== 'string');
    expect({ lang, missing }).toEqual({ lang, missing: [] });
  });

  /*
    ⚠️ IDENTICAL KEY SETS, not merely "English is covered". A key that exists
    only in German is a sentence nobody can reach and a translation nobody will
    maintain; a key that exists only in English is the bug above, waiting.
  */
  it('has the same scan keys in every language', () => {
    const flat = (data: unknown, prefix = ''): string[] =>
      Object.entries(data as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

    const english = flat(dict('en').scan).sort();
    for (const lang of LANGS) {
      expect({ lang, keys: flat(dict(lang).scan).sort() }).toEqual({ lang, keys: english });
    }
  });

  /*
    ⚠️ A placeholder that survives in one language and not another renders the
    name of a company as "{{name}}" on somebody's phone.
  */
  it('keeps the placeholders the screen supplies', () => {
    for (const key of ['createNamed', 'contactAt'] as const) {
      for (const lang of LANGS) {
        expect({ lang, key, has: String(at(dict(lang), `scan.${key}`)).includes('{{name}}') })
          .toEqual({ lang, key, has: true });
      }
    }
  });
});
