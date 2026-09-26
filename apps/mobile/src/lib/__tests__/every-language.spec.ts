import * as fs from 'fs';
import * as path from 'path';

/**
 * ⭐ EVERY WORD THE PHONE SHOWS EXISTS IN ALL FIVE LANGUAGES.
 *
 * A key missing from one locale does not fail anywhere — i18next quietly
 * shows the English `defaultValue`, so a German member reads one English
 * sentence in the middle of a German screen, and nobody notices until they
 * send a screenshot. This reads every literal key the app asks for and every
 * key English has, and fails on the first gap.
 */

const SRC = path.resolve(__dirname, '../..');
const APP = path.resolve(SRC, '../app');
const LANGS = ['en', 'de', 'es', 'fr', 'it'] as const;
const locale = (l: string) => JSON.parse(fs.readFileSync(path.join(SRC, `i18n/locales/${l}.json`), 'utf8'));

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') yield* walk(full); }
    else if (/\.tsx?$/.test(e.name) && !/\.(spec|test|d)\.tsx?$/.test(e.name)) yield full;
  }
}

function has(obj: any, key: string): boolean {
  const at = (k: string) => k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), obj);
  return at(key) !== undefined || at(`${key}_one`) !== undefined || at(`${key}_other`) !== undefined;
}

function flat(o: any, p = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, p ? `${p}.${k}` : k) : [p ? `${p}.${k}` : k]));
}

const all = Object.fromEntries(LANGS.map((l) => [l, locale(l)]));

describe('every language', () => {
  it('has every key the app asks for', () => {
    const asked = new Map<string, string>();
    for (const file of [...walk(SRC), ...walk(APP)]) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*(['"])([A-Za-z][\w]*\.[\w.]+)\1/g)) asked.set(m[2]!, path.relative(SRC, file));
      // Keys held as data (a phrase, a table row) are asked for too.
      for (const m of src.matchAll(/(?:key|labelKey|descKey|titleKey|question|title):\s*'([A-Za-z]+\.[\w.]+)'/g)) asked.set(m[1]!, path.relative(SRC, file));
    }
    const gaps: string[] = [];
    for (const [key, file] of asked) {
      const missing = LANGS.filter((l) => !has(all[l], key));
      if (missing.length) gaps.push(`${key} [${missing.join(',')}] — ${file}`);
    }
    expect(gaps).toEqual([]);
  });

  it('has everything English has', () => {
    const en = flat(all.en);
    const gaps = LANGS.filter((l) => l !== 'en').flatMap((l) => en.filter((k) => !flat(all[l]).includes(k)).map((k) => `${l}: ${k}`));
    expect(gaps).toEqual([]);
  });

  it('names days and months in the APP language, never the phone’s', () => {
    /*
      `toLocaleDateString(undefined, …)` asks the device, so "Monday" arrived
      in English inside a German sentence. `lib/app-dates.ts` asks the app.
    */
    const offenders: string[] = [];
    for (const file of walk(path.join(SRC, 'components/home'))) {
      if (/toLocale(Date|Time)String\(undefined/.test(fs.readFileSync(file, 'utf8'))) offenders.push(path.relative(SRC, file));
    }
    expect(offenders).toEqual([]);
  });
});
