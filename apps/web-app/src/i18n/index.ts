import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';

const LANGUAGE_KEY = 'hbcfield_language';
const SUPPORTED = ['en', 'de', 'es', 'fr', 'it'] as const;

function getStoredLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(LANGUAGE_KEY);
  // Never trust the stored value blindly: an unsupported code leaves i18next
  // without a resource bundle and the UI resolves to whatever it finds.
  return stored && (SUPPORTED as readonly string[]).includes(stored) ? stored : 'en';
}

/*
  SERVER RENDERS ARE ALWAYS ENGLISH, and pinned rather than derived.

  The marketing pages are prerendered at build time, so exactly one language is
  baked into the HTML every visitor and every crawler receives first. A
  production build once emitted the whole home page in Italian while the same
  source built English locally — non-deterministic, and invisible until somebody
  reads the served HTML rather than the hydrated page.

  Three things make it deterministic now:
    • `lng` is a literal on the server, not a function that could vary
    • `supportedLngs` refuses to resolve to a language that is not one of ours
    • resources are passed inline, so they are present at init rather than
      loaded asynchronously and raced by the first render

  The client still gets the visitor's language: init reads localStorage in the
  browser, and hydration swaps the text. One canonical prerendered language is
  also what you want for SEO — a crawler should not be served a lottery.
*/
const isServer = typeof window === 'undefined';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: it },
  },
  lng: isServer ? 'en' : getStoredLanguage(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED as unknown as string[],
  interpolation: {
    escapeValue: false,
  },
});

export function changeLanguage(lang: string) {
  // Refuse anything not in the catalogue, and never mutate the shared instance
  // on the server — it is one singleton across every render.
  if (typeof window === 'undefined') return;
  if (!(SUPPORTED as readonly string[]).includes(lang)) return;
  i18n.changeLanguage(lang);
  localStorage.setItem(LANGUAGE_KEY, lang);
}

export function getCurrentLanguage(): string {
  return i18n.language || 'en';
}

export const supportedLanguages = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
] as const;

export default i18n;
