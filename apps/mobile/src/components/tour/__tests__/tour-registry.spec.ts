import { execSync } from 'child_process';
import path from 'path';
import { TOURS } from '../registry';

/*
  ⚠️ THE TOURS DRIFTED FROM THE SCREENS WITHOUT ANYTHING NOTICING.

  v2 replaced the home, the job page and the headers; the tours kept naming
  anchors that no longer existed. Nothing failed — a missing target is skipped
  by design — so the Welcome tour opened on "Step 4 of 6" and three of its
  steps never appeared for anybody. This walks every step against the source.
*/
const ROOT = path.resolve(__dirname, '../../../..');
const src = execSync('grep -rhoE "(name=\\"[a-z-]+\\"|tourKey: \'[a-z-]+\'|title: \'[a-z-]+\'|avatar: \'[a-z-]+\'|: \'tab-[a-z-]+\')" src app', { cwd: ROOT, encoding: 'utf8' });
const registered = new Set([...src.matchAll(/["']([a-z]+(?:-[a-z]+)+)["']/g)].map((m) => m[1]));

const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const locale = (l: string) => require(`../../../i18n/locales/${l}.json`);
const lookup = (obj: unknown, key: string) => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

describe('every tour step rings something that exists', () => {
  for (const tour of TOURS) {
    it.each(tour.steps.map((s) => [s.target]))(`${tour.id}: %s is registered by a screen`, (target) => {
      expect(registered.has(target)).toBe(true);
    });
  }
});

describe('every tour step is written in every language', () => {
  for (const l of LOCALES) {
    it(`${l} has every title and body`, () => {
      const dict = locale(l);
      const missing = TOURS.flatMap((t) => [t.titleKey, ...t.steps.flatMap((s) => [s.titleKey, s.bodyKey])])
        .filter((k) => typeof lookup(dict, k) !== 'string');
      expect(missing).toEqual([]);
    });
  }
});
