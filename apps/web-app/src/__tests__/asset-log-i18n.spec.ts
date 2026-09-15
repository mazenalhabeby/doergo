/**
 * The asset logbook, in five languages.
 *
 * Every string the logbook screens ask for (`t("assetLog.…")`) must exist in
 * English, and every English leaf must exist in the other four. A missing key
 * renders its path to a German reader; a `{{count}}` string without its
 * `_one`/`_other` forms falls back to English on a German screen. Neither
 * fails a build, and nobody on the team reads the page in Italian.
 */
import fs from 'fs';
import path from 'path';

const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), `src/i18n/locales/${l}.json`), 'utf8'));

function leaves(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}
const at = (obj: any, dotted: string): unknown => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const SOURCES = [
  'src/app/(dashboard)/assets/[id]/_components/logbook-panel.tsx',
  'src/app/(dashboard)/assets/[id]/_components/log-entry-dialog.tsx',
  'src/app/(dashboard)/assets/[id]/page.tsx',
  'src/app/(dashboard)/locations/[id]/_components/log-types-editor.tsx',
  'src/components/assets/log-style.ts',
  'src/components/assets/expense-queue.tsx',
];

describe('asset logbook translations', () => {
  const en = load('en');
  const expected = leaves(en.assetLog, 'assetLog');

  it('has a non-trivial set of keys to check', () => {
    expect(expected.length).toBeGreaterThan(50);
  });

  it('every key the screens ask for exists in English', () => {
    const used = new Set<string>();
    for (const file of SOURCES) {
      const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      for (const m of src.matchAll(/t\(\s*"(assetLog\.[A-Za-z.]+)"/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(50);
    // A count key is stored as its plural forms.
    const missing = [...used].filter((k) => at(en, k) === undefined && at(en, `${k}_other`) === undefined);
    expect(missing).toEqual([]);
  });

  it.each(LOCALES.filter((l) => l !== 'en'))('%s has every English key, non-empty', (loc) => {
    const d = load(loc);
    const missing = expected.filter((k) => typeof at(d, k) !== 'string' || !(at(d, k) as string).trim());
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)('%s never says "paid" or "unpaid"', (loc) => {
    const text = JSON.stringify(load(loc).assetLog).toLowerCase();
    expect(text).not.toMatch(/\b(un)?paid\b/);
  });
});
