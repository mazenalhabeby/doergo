import fs from 'fs';
import path from 'path';
import { AVAILABLE_MODULES, AVAILABLE_ADD_ONS } from '@hbcfield/shared/client';
import { EXPLAINER_KEYS, explainerFor } from '@/lib/explainers/registry';

/**
 * Every module and option must have an explainer, in every language.
 *
 * The failure this prevents is silent by construction. `ExplainerButton`
 * renders nothing when a key has no entry — deliberately, because an "i" that
 * opens an empty dialog is worse than no "i". So a module added next month
 * without copy does not break anything: the button simply never appears, on
 * every screen, in every language, and nobody notices for months.
 *
 * It also guards the weight. The copy is ~30 KB per language; if it ever lands
 * in the main locale files it rides on every page load in all five languages,
 * which is exactly the 150 KB the lazy namespace exists to avoid.
 */

const LANGS = ['en', 'de', 'es', 'fr', 'it'] as const;
const DIR = path.join(process.cwd(), 'src/i18n/explainers');

const catalogue = [
  ...AVAILABLE_MODULES.map((m) => String(m.key)),
  ...AVAILABLE_ADD_ONS.map((a) => String(a.key)),
];

const bundles = Object.fromEntries(
  LANGS.map((l) => [l, JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), 'utf8'))]),
) as Record<string, Record<string, Record<string, unknown>>>;

describe('explainers cover the billing catalogue', () => {
  it('the catalogue is non-empty (a silent empty scan would pass anything)', () => {
    expect(catalogue.length).toBeGreaterThan(20);
  });

  it('every module and option has a registry entry', () => {
    const missing = catalogue.filter((k) => !explainerFor(k));
    expect(missing).toEqual([]);
  });

  it('the registry names no key that has left the catalogue', () => {
    const orphans = EXPLAINER_KEYS.filter((k) => !catalogue.includes(k));
    expect(orphans).toEqual([]);
  });

  it.each(LANGS)('%s has copy for every key', (lang) => {
    const missing = catalogue.filter((k) => !bundles[lang][k]);
    expect(missing).toEqual([]);
  });

  it.each(LANGS)('%s has no copy for a key that does not exist', (lang) => {
    const orphans = Object.keys(bundles[lang]).filter((k) => !catalogue.includes(k));
    expect(orphans).toEqual([]);
  });

  it.each(LANGS)('%s fills every required field', (lang) => {
    const bad: string[] = [];

    for (const key of catalogue) {
      const e = bundles[lang][key] as Record<string, unknown> | undefined;
      if (!e) continue;

      for (const field of ['summary', 'caveat'] as const) {
        if (typeof e[field] !== 'string' || !(e[field] as string).trim()) {
          bad.push(`${key}.${field} empty`);
        }
      }
      for (const field of ['steps', 'benefits'] as const) {
        const list = e[field];
        if (!Array.isArray(list) || list.length === 0) bad.push(`${key}.${field} empty`);
        else if (list.some((s) => typeof s !== 'string' || !s.trim())) {
          bad.push(`${key}.${field} has a blank entry`);
        }
      }
      const fit = e.fit as Record<string, unknown> | undefined;
      if (!fit?.on || !fit?.off) bad.push(`${key}.fit incomplete`);

      // A caption is only meaningful where a diagram is drawn — and where one
      // is drawn, an unlabelled picture is worse than none.
      const hasDiagram = Boolean(explainerFor(key)?.diagram);
      const caption = typeof e.caption === 'string' ? e.caption.trim() : '';
      if (hasDiagram && !caption) bad.push(`${key}.caption missing but a diagram is drawn`);
    }

    expect(bad).toEqual([]);
  });

  it('every language carries the same key set as English', () => {
    const en = Object.keys(bundles.en).sort();
    for (const lang of LANGS) {
      expect({ lang, keys: Object.keys(bundles[lang]).sort() }).toEqual({ lang, keys: en });
    }
  });
});

describe('explainer copy stays out of the main bundle', () => {
  it('is not present in the main locale files', () => {
    // `explainers.*` here would mean the copy is bundled with everything else.
    for (const lang of LANGS) {
      const main = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), `src/i18n/locales/${lang}.json`), 'utf8'),
      );
      expect(Object.keys(main)).not.toContain('explainers');
    }
  });

  it('is imported dynamically, never statically', () => {
    const loader = fs.readFileSync(path.join(process.cwd(), 'src/i18n/explainers.ts'), 'utf8');
    for (const lang of LANGS) {
      expect(loader).toContain(`import('./explainers/${lang}.json')`);
      // A static import of the same file puts it straight back into the entry
      // chunk while the dynamic one above still reads as correct.
      expect(loader).not.toMatch(
        new RegExp(`import\\s+\\w+\\s+from\\s+['"]\\./explainers/${lang}\\.json['"]`),
      );
    }
  });

  it('the dialog is code-split away from the button', () => {
    // The button sits on every module row; the dialog, its diagrams and the
    // copy loader must not come with it.
    const btn = fs.readFileSync(
      path.join(process.cwd(), 'src/components/explainer/explainer-button.tsx'),
      'utf8',
    );
    expect(btn).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('\.\/explainer-dialog'\)/);
    expect(btn).not.toMatch(/^import\s+\{[^}]*ExplainerDialog[^}]*\}\s+from/m);
  });
});
