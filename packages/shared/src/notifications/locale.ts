/**
 * The languages a member can read the product in.
 *
 * One list for everything that has to AGREE on it: the gateway validating what a
 * phone sends, auth-service storing it on the member, notification-service
 * choosing which catalogue a push is written from — AND the web and phone
 * language pickers (`LANGUAGE_CHOICES`). The apps used to keep their own copies
 * of the list; they were identical, and a language an app offered without the
 * server accepting it would only be refused on save. One list: adding a
 * language means adding it here, with its push and email catalogues.
 */
export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Each language named in itself — the way a picker is read by someone who may not speak the current one. */
export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
};

const LOCALE_FLAGS: Record<SupportedLocale, string> = { en: '🇬🇧', de: '🇩🇪', es: '🇪🇸', fr: '🇫🇷', it: '🇮🇹' };

/** The app language picker, web and phone alike. */
export const LANGUAGE_CHOICES: ReadonlyArray<{ code: SupportedLocale; label: string; flag: string }> =
  SUPPORTED_LOCALES.map((code) => ({ code, label: LOCALE_NAMES[code], flag: LOCALE_FLAGS[code] }));

/** What a member who never told us reads. */
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * A stored or reported language, reduced to one we have a catalogue for.
 *
 * Tolerates a region ("de-AT", "fr_CH") because that is what a device reports
 * when asked, and returns null — never a guess — for anything else, so the
 * caller decides what "unknown" means (the default, or leave the column alone).
 */
export function normalizeLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string') return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(base) ? base : null;
}
