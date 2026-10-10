import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGE_CHOICES } from '@hbcfield/shared/client';
import en from './locales/en.json';

const LANGUAGE_KEY = 'hbcfield_language';

type Bundle = Record<string, unknown>;

/*
  ⚠️ ONLY ENGLISH IS EVALUATED AT LAUNCH. All five catalogues (~960 KB of
  JSON) were imported here, so the first frame built four languages nobody had
  chosen. English stays bundled — it is the fallback and the first render's
  language — and the others are `require`d the first time they are used.

  ⚠️ AN EXPLICIT MAP, NEVER A TEMPLATE LITERAL. Metro cannot resolve
  `require(\`./locales/${lang}.json\`)`; each require stays literal so the
  bundler still includes the file.

  ⚠️ EVERY LANGUAGE CHANGE LOADS ITS BUNDLE FIRST — including a direct
  `i18n.changeLanguage(...)` (wrapped below). The web had exactly this bug:
  switching before the bundle arrived silently rendered English.
*/
const LOADERS: Record<string, () => Bundle> = {
  de: () => require('./locales/de.json') as Bundle,
  es: () => require('./locales/es.json') as Bundle,
  fr: () => require('./locales/fr.json') as Bundle,
  it: () => require('./locales/it.json') as Bundle,
};

const SUPPORTED = ['en', 'de', 'es', 'fr', 'it'] as const;

/** Load a language's catalogue if it is not loaded yet. False for a language the app does not have. */
export function ensureLanguage(lang: string | null | undefined): boolean {
  if (!lang) return false;
  const code = lang.split('-')[0]!;
  if (code === 'en' || i18n.hasResourceBundle(code, 'translation')) return true;
  const load = LOADERS[code];
  if (!load) return false;
  const mod = load() as Bundle & { default?: Bundle };
  i18n.addResourceBundle(code, 'translation', mod.default ?? mod, true, true);
  return true;
}

// Load stored language BEFORE i18n init so the first render uses the correct language
let storedLang: string | null = null;
const langReady = AsyncStorage.getItem(LANGUAGE_KEY).then((lang) => {
  if (lang && (SUPPORTED as readonly string[]).includes(lang)) {
    storedLang = lang;
  }
}).catch(() => undefined);

// Initialize synchronously with 'en', then switch if needed
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

// Whoever switches — this module, a settings page, a test — the bundle is there first.
const rawChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = ((lng?: string, cb?: Parameters<typeof rawChangeLanguage>[1]) => {
  ensureLanguage(lng);
  return rawChangeLanguage(lng, cb);
}) as typeof i18n.changeLanguage;

/**
 * Resolves once the stored language has been APPLIED (its catalogue loaded
 * and switched to) — the root layout waits on this before its first screen,
 * so a German member never sees an English frame.
 */
export const i18nReady: Promise<void> = langReady.then(async () => {
  if (storedLang && storedLang !== i18n.language) {
    await i18n.changeLanguage(storedLang);
  }
});

export async function changeLanguage(lang: string) {
  await i18n.changeLanguage(lang);
  storedLang = lang;
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}

export function getCurrentLanguage(): string {
  return i18n.language || 'en';
}

/**
 * The member's chosen language once it has been read from storage.
 *
 * `getCurrentLanguage()` answers 'en' for the first moments after launch, before
 * the stored choice is applied — and that is exactly when push registration
 * runs. Asking this instead is what stops every launch telling the server the
 * member reads English.
 */
export async function getPreferredLanguage(): Promise<string> {
  await langReady;
  return storedLang ?? getCurrentLanguage();
}

/** The language picker's choices — one list with the web and the server (shared). */
export const supportedLanguages = LANGUAGE_CHOICES;

export default i18n;
