import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

/*
  The language list and the key live in `./languages`, which imports no
  catalogue — see the warning at the top of that file. Two copies of "which
  languages exist" is how one of them starts offering a language the other
  cannot load.
*/
import { LANGUAGE_KEY, SUPPORTED, isSupported, supportedLanguages, type Supported } from './languages';

export { supportedLanguages };
export type { Supported };

/*
  ENGLISH IS BUNDLED; THE OTHER FOUR ARE FETCHED WHEN ASKED FOR.

  All five used to be static imports, which put the entire translation
  catalogue — ~1.8 MB raw, 470 KB gzipped, 57% of the page's JavaScript — into
  a single chunk that every visitor downloaded before the page could render.
  An English speaker paid for German, Spanish, French and Italian; a German
  speaker paid for the other four.

  English stays inline for one specific reason: the server render is pinned to
  it (see below), and the prerendered HTML must be produced without waiting on
  anything. It is also the `fallbackLng`, so a failed fetch of any other
  language degrades to readable English rather than to raw translation keys.

  An explicit map, not `import(`./locales/${lang}.json`)`. A template literal
  makes webpack build a context module over everything the pattern matches,
  and how it splits that is a bundler implementation detail — precisely the
  kind of thing that silently reunites the five files into one chunk again and
  undoes all of this without a single line of the diff looking wrong.
*/
const LOADERS: Record<Exclude<Supported, 'en'>, () => Promise<{ default: unknown }>> = {
  de: () => import('./locales/de.json'),
  es: () => import('./locales/es.json'),
  fr: () => import('./locales/fr.json'),
  it: () => import('./locales/it.json'),
};

const loaded = new Set<string>(['en']);

function getStoredLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(LANGUAGE_KEY);
  // Never trust the stored value blindly: an unsupported code leaves i18next
  // without a resource bundle and the UI resolves to whatever it finds.
  return stored && isSupported(stored) ? stored : 'en';
}

/**
 * Fetch a language's bundle and register it. Resolves `true` once the language
 * is usable — including immediately, if it already is.
 *
 * A rejected chunk fetch is swallowed on purpose. English is already loaded and
 * every key falls back through it, so a flaky network costs the visitor their
 * preferred language and never a screen of raw dotted keys.
 */
async function ensureBundle(lang: string): Promise<boolean> {
  if (loaded.has(lang)) return true;
  // Split rather than combined with `||` so the second check narrows `lang` to
  // the four languages LOADERS actually has a key for.
  if (!isSupported(lang)) return false;
  if (lang === 'en') return false;
  try {
    const mod = await LOADERS[lang]();
    i18n.addResourceBundle(lang, 'translation', mod.default ?? mod, true, true);
    loaded.add(lang);
    return true;
  } catch {
    return false;
  }
}

/*
  SERVER RENDERS ARE ALWAYS ENGLISH, and pinned rather than derived.

  The marketing pages are prerendered at build time, so exactly one language is
  baked into the HTML every visitor and every crawler receives first. A
  production build once emitted the whole home page in Italian while the same
  source built English locally — non-deterministic, and invisible until somebody
  reads the served HTML rather than the hydrated page.

  Three things make it deterministic:
    • `lng` is a literal, not a function that could vary
    • `supportedLngs` refuses to resolve to a language that is not one of ours
    • English is passed inline, so it is present at init rather than loaded
      asynchronously and raced by the first render

  `lng` is now 'en' on the CLIENT too, not just the server. That is a fix, not a
  regression: the client used to init straight into the stored language while
  the server had rendered English, so React hydrated a tree that disagreed with
  the HTML it was hydrating. Non-English visitors already saw English until
  hydration; they now see it until the language chunk lands, which is one
  request against a file nginx serves from disk.
*/
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: SUPPORTED as unknown as string[],
  interpolation: {
    escapeValue: false,
  },
});

// Start the visitor's language on its way immediately — at module evaluation,
// before React renders — so the fetch overlaps hydration instead of following
// it.
if (typeof window !== 'undefined') {
  const stored = getStoredLanguage();
  if (stored !== 'en') {
    void ensureBundle(stored).then((ok) => {
      if (ok) void i18n.changeLanguage(stored);
    });
  }
}

/**
 * Switch language, fetching the bundle first if this is its first use.
 *
 * Returns a promise, but callers are not required to await it — the UI updates
 * through i18next's own change event either way.
 */
export async function changeLanguage(lang: string): Promise<void> {
  // Refuse anything not in the catalogue, and never mutate the shared instance
  // on the server — it is one singleton across every render.
  if (typeof window === 'undefined') return;
  if (!isSupported(lang)) return;

  // Persisted before the fetch, deliberately. The stored value records what the
  // visitor chose; if the chunk fails to arrive they keep seeing English now,
  // but the choice survives and is retried on the next load. Writing it only on
  // success would silently discard their preference over a dropped request.
  localStorage.setItem(LANGUAGE_KEY, lang);

  if (!(await ensureBundle(lang))) return;
  await i18n.changeLanguage(lang);
}

export function getCurrentLanguage(): string {
  return i18n.language || 'en';
}



export default i18n;
