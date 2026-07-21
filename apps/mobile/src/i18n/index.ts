import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';

const LANGUAGE_KEY = 'hbcfield_language';

// Load stored language BEFORE i18n init so the first render uses the correct language
let storedLang: string | null = null;
const langReady = AsyncStorage.getItem(LANGUAGE_KEY).then((lang) => {
  if (lang && (lang === 'en' || lang === 'de' || lang === 'es')) {
    storedLang = lang;
  }
});

// Initialize synchronously with 'en', then switch if needed
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    es: { translation: es },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

// Apply stored language as soon as it's loaded
langReady.then(() => {
  if (storedLang && storedLang !== i18n.language) {
    i18n.changeLanguage(storedLang);
  }
});

/** Promise that resolves when stored language has been applied */
export const i18nReady = langReady;

export async function changeLanguage(lang: string) {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}

export function getCurrentLanguage(): string {
  return i18n.language || 'en';
}

export const supportedLanguages = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
] as const;

export default i18n;
