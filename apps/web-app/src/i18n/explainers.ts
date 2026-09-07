import i18n from '@/i18n';

/**
 * Explainer copy, fetched on demand.
 *
 * Twenty-eight modules and options, each with a paragraph, several steps and a
 * handful of bullets, in five languages. Bundled with everything else that
 * would be roughly 150 KB of JSON riding on every page load — including the
 * marketing pages, whose weight was cut by more than half specifically to stop
 * shipping text nobody on that page reads.
 *
 * So it is its own i18next namespace, loaded the first time somebody opens an
 * explainer and then cached for the session. English always comes along, even
 * for a German reader: it is `fallbackLng`, so a string that has not been
 * translated yet renders in English rather than as a raw dotted key.
 *
 * The map is explicit rather than `import(`./explainers/${lang}.json`)`. A
 * template literal makes webpack build a context module over everything the
 * pattern matches, and how it chooses to split that is a bundler implementation
 * detail — exactly the thing that quietly reunites five files into one chunk.
 */

export const EXPLAINER_NS = 'explainers';

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  en: () => import('./explainers/en.json'),
  de: () => import('./explainers/de.json'),
  es: () => import('./explainers/es.json'),
  fr: () => import('./explainers/fr.json'),
  it: () => import('./explainers/it.json'),
};

const loaded = new Set<string>();
/** In-flight requests, so twelve buttons on one screen cause one fetch. */
const inFlight = new Map<string, Promise<void>>();

async function loadOne(lang: string): Promise<void> {
  if (loaded.has(lang)) return;
  const existing = inFlight.get(lang);
  if (existing) return existing;

  const load = LOADERS[lang];
  if (!load) return;

  const p = load()
    .then((mod) => {
      i18n.addResourceBundle(lang, EXPLAINER_NS, mod.default ?? mod, true, true);
      loaded.add(lang);
    })
    .catch(() => {
      // A failed chunk must not wedge the dialog shut. English is requested
      // alongside every language, so the reader still gets words; if English
      // itself failed there is nothing useful to show and the caller renders
      // its empty state.
    })
    .finally(() => {
      inFlight.delete(lang);
    });

  inFlight.set(lang, p);
  return p;
}

/**
 * Make sure the explainer copy is available for the active language.
 * Resolves once the strings can be read (or once it is clear they cannot).
 */
export async function ensureExplainers(lang: string): Promise<void> {
  const target = (lang || 'en').split('-')[0];
  await Promise.all(target === 'en' ? [loadOne('en')] : [loadOne('en'), loadOne(target)]);
}

/** Whether the copy for a language is already in memory — used to skip a spinner. */
export function explainersReady(lang: string): boolean {
  const target = (lang || 'en').split('-')[0];
  return loaded.has('en') && (target === 'en' || loaded.has(target));
}
