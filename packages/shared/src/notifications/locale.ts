/**
 * The languages a member can read the product in.
 *
 * One list for everything that has to AGREE on it: the gateway validating what a
 * phone sends, auth-service storing it on the member, notification-service
 * choosing which catalogue a push is written from. The two apps keep their own
 * copy beside their bundles (they decide what they can DISPLAY); this is what
 * the server will ACCEPT, and a language added to an app without a push
 * catalogue behind it must be refused here rather than stored and ignored.
 */
export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

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
