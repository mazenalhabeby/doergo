import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en.json"

/*
  The language list and the key live in `./languages`, which imports no
  catalogue — see the warning at the top of that file. Two copies of "which
  languages exist" is how one of them starts offering a language the other
  cannot load.
*/
import { LANGUAGE_KEY, SUPPORTED, isSupported, type Supported } from "./languages"
import { refusalSentence, setRefusalTranslator } from "../lib/refusal-text"

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
const LOADERS: Record<Exclude<Supported, "en">, () => Promise<{ default: unknown }>> = {
  de: () => import("./locales/de.json"),
  es: () => import("./locales/es.json"),
  fr: () => import("./locales/fr.json"),
  it: () => import("./locales/it.json"),
}

const loaded = new Set<string>(["en"])

/*
  THE MARKETING SITE'S TEXT IS ITS OWN FILE (5.6): `home`, `pricing`, `privacy`, `terms` live in
  `locales/marketing/<lang>.json`, so no app page carries the public site's copy. A public page's
  server render hands its English groups to `<MarketingCopy>` (components/marketing), which
  registers them before the page renders; any other language is fetched here, by the same kind of
  explicit map, once a public page has asked for it (`wantMarketing`).
*/
const MARKETING_LOADERS: Record<Supported, () => Promise<{ default: unknown }>> = {
  en: () => import("./locales/marketing/en.json"),
  de: () => import("./locales/marketing/de.json"),
  es: () => import("./locales/marketing/es.json"),
  fr: () => import("./locales/marketing/fr.json"),
  it: () => import("./locales/marketing/it.json"),
}
const marketingLoaded = new Set<string>()
let marketingWanted = false

/** Register one language's marketing groups (deep-merged; existing keys win). */
export function registerMarketingCopy(lang: string, groups: Record<string, unknown>): void {
  i18n.addResourceBundle(lang, "translation", groups, true, false)
}

/** Fetch and register one language's marketing text; resolves `true` once it is usable. */
async function ensureMarketing(lang: string): Promise<boolean> {
  if (marketingLoaded.has(lang)) return true
  if (!isSupported(lang)) return false
  try {
    const mod = await MARKETING_LOADERS[lang]()
    registerMarketingCopy(lang, (mod.default ?? mod) as Record<string, unknown>)
    marketingLoaded.add(lang)
    return true
  } catch {
    return false
  }
}

/**
 * A public page is showing: from now on every language switch brings its marketing text too, and
 * the current language's arrives now (components re-render when it lands — `bindI18nStore`).
 */
export function wantMarketing(): void {
  if (typeof window === "undefined") return
  marketingWanted = true
  if (i18n.language !== "en") void ensureMarketing(i18n.language)
}

function getStoredLanguage(): string {
  if (typeof window === "undefined") return "en"
  const stored = localStorage.getItem(LANGUAGE_KEY)
  // Never trust the stored value blindly: an unsupported code leaves i18next
  // without a resource bundle and the UI resolves to whatever it finds.
  return stored && isSupported(stored) ? stored : "en"
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
  if (loaded.has(lang)) {
    if (marketingWanted && lang !== "en") await ensureMarketing(lang)
    return true
  }
  // Split rather than combined with `||` so the second check narrows `lang` to
  // the four languages LOADERS actually has a key for.
  if (!isSupported(lang)) return false
  if (lang === "en") return false
  try {
    const mod = await LOADERS[lang]()
    i18n.addResourceBundle(lang, "translation", mod.default ?? mod, true, true)
    loaded.add(lang)
    if (marketingWanted) await ensureMarketing(lang)
    return true
  } catch {
    return false
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
  lng: "en",
  fallbackLng: "en",
  supportedLngs: SUPPORTED as unknown as string[],
  interpolation: {
    escapeValue: false,
  },
  // Re-render when a bundle is ADDED, not only on a language change: a public page's text for the
  // current language can arrive after the language itself (see wantMarketing).
  react: { bindI18nStore: "added" },
})

// A coded server refusal (an ApiError with `code`) reads its message through
// this, in whatever language is current when it is shown — see lib/server-error.
setRefusalTranslator((code, params) =>
  refusalSentence(code, params, (key, options) => i18n.t(key, options), i18n.language),
)

// Start the visitor's language on its way immediately — at module evaluation,
// before React renders — so the fetch overlaps hydration instead of following
// it.
if (typeof window !== "undefined") {
  const stored = getStoredLanguage()
  if (stored !== "en") {
    void ensureBundle(stored).then((ok) => {
      if (ok) void i18n.changeLanguage(stored)
    })
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
  if (typeof window === "undefined") return
  if (!isSupported(lang)) return

  // Persisted before the fetch, deliberately. The stored value records what the
  // visitor chose; if the chunk fails to arrive they keep seeing English now,
  // but the choice survives and is retried on the next load. Writing it only on
  // success would silently discard their preference over a dropped request.
  localStorage.setItem(LANGUAGE_KEY, lang)

  if (!(await ensureBundle(lang))) return
  await i18n.changeLanguage(lang)
}

export default i18n
