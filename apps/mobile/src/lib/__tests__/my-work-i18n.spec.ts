import { readFileSync } from 'fs';
import { join } from 'path';
import { WORK_BAND_KEY, WORK_BANDS } from '@hbcfield/shared/client';

/**
 * Every band and every reason has words, in every language.
 *
 * A missing key does not crash — i18next renders the key itself — so a German
 * reader sees `tasks.myWork.bands.overdue` on the one screen that is supposed to
 * tell them what is late. Nothing in a typecheck or a render test catches that,
 * which is why it is asserted here.
 */
const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;

const load = (lang: string) =>
  JSON.parse(readFileSync(join(__dirname, '..', '..', 'i18n', 'locales', `${lang}.json`), 'utf8'));

const at = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

describe('my-work is translated everywhere', () => {
  /*
    The band keys come from SHARED, not from a list retyped here: adding a band
    must fail this test until it has words, which is the whole point.
  */
  it.each(LOCALES)('%s names every band', (lang) => {
    const dict = load(lang);
    for (const band of WORK_BANDS) {
      const value = at(dict, WORK_BAND_KEY[band]);
      expect(typeof value === 'string' && value.length > 0).toBe(true);
    }
  });

  const REQUIRED = [
    'tasks.myWork.scope.mine',
    'tasks.myWork.scope.all',
    'tasks.myWork.next.label',
    'tasks.myWork.next.open',
    'tasks.myWork.next.doing',
    'tasks.myWork.next.doingLate',
    'tasks.myWork.next.blocked',
    'tasks.myWork.next.overdue',
    'tasks.myWork.next.today',
    'tasks.myWork.next.upcoming',
    'tasks.myWork.empty.title',
    'tasks.myWork.empty.body',
  ];

  it.each(LOCALES)('%s has every string the screen renders', (lang) => {
    const dict = load(lang);
    const missing = REQUIRED.filter((k) => typeof at(dict, k) !== 'string');
    expect(missing).toEqual([]);
  });

  /*
    "1 day late" and "2 days late" are different sentences in every language
    here, and i18next needs the `_other` form to say the second one.
  */
  it.each(LOCALES)('%s has a plural form where a count is counted', (lang) => {
    const dict = load(lang);
    for (const key of ['tasks.myWork.next.doingLate', 'tasks.myWork.next.overdue']) {
      expect(typeof at(dict, `${key}_other`)).toBe('string');
    }
  });

  it.each(LOCALES)('%s keeps the interpolation the code passes', (lang) => {
    const dict = load(lang);
    for (const key of ['tasks.myWork.next.doingLate', 'tasks.myWork.next.overdue']) {
      expect(at(dict, key)).toContain('{{count}}');
      expect(at(dict, `${key}_other`)).toContain('{{count}}');
    }
  });

  /*
    A translation that is still English is worse than a missing one: it looks
    finished. Checked on the two strings most likely to be copied over.
  */
  it('translated the scope rather than copying English', () => {
    const en = load('en');
    for (const lang of LOCALES.filter((l) => l !== 'en')) {
      const dict = load(lang);
      expect(at(dict, 'tasks.myWork.scope.mine')).not.toBe(at(en, 'tasks.myWork.scope.mine'));
      expect(at(dict, 'tasks.myWork.bands.overdue')).not.toBe(at(en, 'tasks.myWork.bands.overdue'));
    }
  });
});
