import * as fs from 'fs';
import * as path from 'path';
import { readSource } from '@/test-utils/read-source';
import { MANAGE_ROWS, MEMBER_ROWS } from '@/lib/manage-rows';

/**
 * Every word the Shortcuts widget can put on screen, in all five languages.
 *
 * The card calls `t(r.labelKey)` / `t(r.descKey)` with NO default, so a missing
 * key renders as the raw key ("shortcuts.planRoute") on the tile itself.
 */
const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const dir = path.resolve(__dirname, '../../../i18n/locales');
const catalogues = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8'))]));
const get = (o: unknown, k: string): unknown => k.split('.').reduce<unknown>((a, p) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[p] : undefined), o);
const vars = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const CARD = readSource(path.resolve(__dirname, '../shortcuts-card.tsx'), 'utf8');
const cardKeys = [...new Set([...CARD.matchAll(/t\('((?:shortcutsCard|widgets|pitch)\.[A-Za-z.]+)'/g)].map((m) => m[1]!))];
const groupKeys = ['waiting', 'do', 'go', 'manage'].map((g) => `shortcutsCard.group.${g}`);
const rowKeys = [...MANAGE_ROWS, ...MEMBER_ROWS].flatMap((r) => [r.labelKey, r.descKey]);
/** Plural keys: i18next resolves `_one` / `_other`. */
const PLURAL = new Set(['shortcutsCard.waiting']);

describe('Shortcuts widget — i18n', () => {
  it('found the card’s own keys (the scan is not empty)', () => {
    expect(cardKeys).toEqual(expect.arrayContaining(['shortcutsCard.edit', 'shortcutsCard.title', 'shortcutsCard.waiting', 'widgets.shortcuts', 'pitch.shortcuts']));
  });

  for (const key of [...cardKeys, ...groupKeys, ...rowKeys, 'widgets.q.shortcuts']) {
    it(`${key} exists in every language, with the same placeholders`, () => {
      const forms = PLURAL.has(key) ? [`${key}_one`, `${key}_other`] : [key];
      for (const f of forms) {
        const en = get(catalogues.en, f);
        expect(typeof en).toBe('string');
        for (const l of LOCALES) {
          const v = get(catalogues[l], f);
          expect({ l, f, type: typeof v }).toEqual({ l, f, type: 'string' });
          expect((v as string).trim().length).toBeGreaterThan(0);
          expect({ l, f, vars: vars(v as string) }).toEqual({ l, f, vars: vars(en as string) });
        }
      }
    });
  }
});
