/**
 * Every word on Today's route in all five languages — the same keys, the same
 * plural forms, the same placeholders, and none of the words this product does
 * not use about time.
 */
import fs from 'fs';
import path from 'path';
import { readSource } from '@/test-utils/read-source';

const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const dir = path.join(__dirname, '../../i18n/locales');
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8')) as Record<string, any>;
const all = Object.fromEntries(LOCALES.map((l) => [l, load(l)]));

/** Every `t('…')` key the card and its drawing ask for. */
function keysUsed(): string[] {
  const files = ['../../features/home/route-card.tsx', '../../features/home/route-sketch.tsx'];
  const src = files.map((f) => readSource(path.join(__dirname, f), 'utf8')).join('\n');
  return [...new Set([...src.matchAll(/\bt\('([A-Za-z0-9_.]+)'/g)].map((m) => m[1]!))];
}
const lookup = (obj: any, key: string) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
/** A key exists when it, or its plural forms, do. */
const has = (obj: any, key: string) => lookup(obj, key) !== undefined || lookup(obj, `${key}_one`) !== undefined;
const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('Today\'s route — five languages', () => {
  it('finds the keys the card uses', () => {
    expect(keysUsed().length).toBeGreaterThan(20);
  });

  it.each(LOCALES)('%s has every key the card uses', (l) => {
    expect(keysUsed().filter((k) => !has(all[l], k))).toEqual([]);
  });

  it.each(LOCALES)('%s has exactly the routeCard keys English has', (l) => {
    expect(Object.keys(all[l]!.routeCard).sort()).toEqual(Object.keys(all.en!.routeCard).sort());
  });

  it.each(LOCALES)('%s: no routeCard string is empty, and placeholders match English', (l) => {
    for (const [k, v] of Object.entries(all.en!.routeCard as Record<string, string>)) {
      const mine = all[l]!.routeCard[k] as string;
      expect(typeof mine).toBe('string');
      expect(mine.trim().length).toBeGreaterThan(0);
      expect([k, placeholders(mine)]).toEqual([k, placeholders(v)]);
    }
  });

  it('never says paid/unpaid in any language', () => {
    const banned = /\b(paid|unpaid|bezahlt|unbezahlt|pagad[oa]s?|no pagad|payé|non payé|pagat[oi]|non pagat)/i;
    for (const l of LOCALES) {
      const text = JSON.stringify(all[l]!.routeCard);
      expect([l, banned.test(text)]).toEqual([l, false]);
    }
  });
});
