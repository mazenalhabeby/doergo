import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';

/**
 * The full translation catalogue, for SERVER rendering only.
 *
 * This is the single place in the app where every locale file is statically
 * imported. Server components read localized copy through it — marketing pages,
 * JSON-LD, the localized home routes — because on the server the whole
 * catalogue is free: it never crosses to the browser.
 *
 * ⚠️ NEVER import this from a file marked `'use client'`. Doing so puts ~1.8 MB
 * of JSON — five languages of the entire application, dashboard included — into
 * the browser bundle. That is not hypothetical: it is what shipped, through a
 * client component that imported a URL helper from a module which happened to
 * sit next to the copy accessors. `src/__tests__/i18n-client-bundle.spec.ts`
 * walks the real client import graph and fails if anything reaches here.
 *
 * The client's own path is `src/i18n/index.ts`, which bundles English and
 * fetches the other four on demand.
 */
const BUNDLES: Record<string, unknown> = { en, de, es, fr, it };

/** One language's complete translations; falls back to English. */
export function localeBundle(lang: string): Record<string, unknown> {
  return (BUNDLES[lang] ?? BUNDLES.en) as Record<string, unknown>;
}

/**
 * The namespaces the marketing home page renders.
 *
 * `/de`, `/es`, `/fr` and `/it` are prerendered with their language inlined
 * into the HTML, so that the localized body reaches crawlers. Inlining the FULL
 * catalogue to do it took those pages from 113 KB to 459 KB of HTML — four
 * times the weight, on the one page whose load time search engines actually
 * measure, to ship the dashboard's, documents' and guided tours' translations
 * to a visitor who is reading a marketing page.
 *
 * The page uses four namespaces and about 9% of the file. Two of them —
 * `modules` and `addOns` — are reached only through template-literal keys
 * (`t(`modules.${k}.label`)`), which no reading of the imports would reveal;
 * they were found by grepping for the pattern. That is exactly why the list is
 * enforced rather than maintained: `src/__tests__/marketing-namespaces.spec.ts`
 * scans every `t()` call under the home tree and fails if one reaches outside.
 *
 * A namespace that goes missing does not crash — i18next renders the key's
 * fallback or the raw key — so nothing would catch it but a person noticing
 * `home.hero.title` on the page in production.
 */
export const MARKETING_NAMESPACES = ['home', 'common', 'modules', 'addOns'] as const;

/** Just the marketing slice of one language, for the localized home routes. */
export function marketingBundle(lang: string): Record<string, unknown> {
  const full = localeBundle(lang);
  const out: Record<string, unknown> = {};
  for (const ns of MARKETING_NAMESPACES) {
    if (full[ns] !== undefined) out[ns] = full[ns];
  }
  return out;
}
