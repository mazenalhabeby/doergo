/**
 * Every sentence the shift clock can say, in all five languages — and never
 * the word "paid" (rule 4: counted, worked, approved).
 *
 * The keys are read out of the card's SOURCE, so a key added to the card and
 * forgotten in a catalogue fails here rather than rendering its English
 * `defaultValue` to a German member.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SHIFT_CARD_FILES } from './shift-card-files';
import { readSource } from '../../test-utils/read-source';

const SRC = path.resolve(__dirname, '../..');
const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const CARD_FILES = [...SHIFT_CARD_FILES, 'components/home/shift-state.ts'];

function flat(o: Record<string, unknown>, p = '', out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object') flat(v as Record<string, unknown>, key, out);
    else out[key] = String(v);
  }
  return out;
}
const catalogue = Object.fromEntries(
  LOCALES.map((l) => [l, flat(JSON.parse(readSource(path.join(SRC, `i18n/locales/${l}.json`), 'utf8')))]),
) as Record<(typeof LOCALES)[number], Record<string, string>>;

const card = SHIFT_CARD_FILES.map((f) => readSource(path.join(SRC, f), 'utf8')).join('\n');
/** `t('a.b', { count … })` → keys, and whether they are plural. */
const calls = [...card.matchAll(/\bt\(\s*[`'"]([a-zA-Z0-9_.]+)[`'"]\s*(,\s*\{([\s\S]*?)\})?\s*\)/g)].map((m) => ({
  key: m[1],
  plural: /\bcount\s*:/.test(m[3] ?? ''),
  vars: [...(m[3] ?? '').matchAll(/(?:^|[,{\s])([a-zA-Z]+)\s*:/g)].map((v) => v[1]).filter((v) => !v.startsWith('defaultValue')),
}));
const keys = [...new Map(calls.map((c) => [c.key, c])).values()];

describe('the card\'s keys', () => {
  it('finds the keys it expects to (the parser is not silently empty)', () => {
    expect(keys.length).toBeGreaterThanOrEqual(30);
    expect(keys.map((k) => k.key)).toEqual(expect.arrayContaining([
      'shiftClock.onTheClock', 'shiftClock.countedFrozen', 'shiftClock.restOverdue', 'home.fullTime.clockIn',
    ]));
  });

  describe.each(LOCALES)('%s', (lng) => {
    it.each(keys.map((k) => [k.key, k] as const))('%s exists', (_key, k) => {
      const c = catalogue[lng];
      if (k.plural) {
        expect(c[`${k.key}_one`]).toBeTruthy();
        expect(c[`${k.key}_other`]).toBeTruthy();
      } else {
        expect(c[k.key]).toBeTruthy();
      }
    });

    it('every interpolation the card passes is used the same way as in English', () => {
      for (const k of keys) {
        for (const form of k.plural ? ['_one', '_other'] : ['']) {
          const en = catalogue.en[k.key + form] ?? '';
          const here = catalogue[lng][k.key + form] ?? '';
          const need = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
          // `_one` may drop {{count}} ("a minute ago") — every OTHER variable must survive
          const drop = (xs: string[]) => (form === '_one' ? xs.filter((x) => x !== 'count') : xs);
          expect({ key: k.key + form, vars: drop(need(here)) }).toEqual({ key: k.key + form, vars: drop(need(en)) });
          // …and nothing the translation needs is left unsupplied by the card
          for (const v of need(here)) expect({ key: k.key, v, supplied: v === 'count' || k.vars.includes(v) }).toEqual({ key: k.key, v, supplied: true });
        }
      }
    });
  });
});

describe('never "paid" (rule 4)', () => {
  const PAID = /\b(paid|unpaid|bezahlt\w*|unbezahlt\w*|vergüt\w*|pagad[oa]s?|remunerad\w*|pay[ée]e?s?|rémunér\w*|pagat[oaie]|retribuit\w*)\b/i;

  it.each(LOCALES)('%s — no shiftClock / shiftEnd sentence says it', (lng) => {
    const hits = Object.entries(catalogue[lng]).filter(([k, v]) => /^(shiftClock|shiftEnd)\./.test(k) && PAID.test(v));
    expect(hits).toEqual([]);
  });

  it.each(LOCALES)('%s — no sentence the card uses says it', (lng) => {
    const hits = keys.flatMap((k) => (k.plural ? [`${k.key}_one`, `${k.key}_other`] : [k.key]))
      .filter((k) => PAID.test(catalogue[lng][k] ?? ''));
    expect(hits).toEqual([]);
  });

  it('no English fallback in the card\'s own source says it', () => {
    for (const f of CARD_FILES) {
      const strings = [...readSource(path.join(SRC, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
        .matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2]);
      expect({ f, hits: strings.filter((s) => PAID.test(s)) }).toEqual({ f, hits: [] });
    }
  });
});
