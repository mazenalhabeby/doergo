import { isSupportedLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../notifications/locale';

/**
 * A CLIENT's language — what the office says a client reads.
 *
 * A member tells us their language by using the app. A client mostly never
 * signs in: they are an address a signing link, an invitation or an invoice is
 * sent to. So the office says it on the client record, and this is the rule for
 * what that field may hold.
 *
 * Browser-safe on purpose: the web form and the server validate against the
 * same list, so a language the form offers is never one the server refuses.
 */

/**
 * What a write may put in `Customer.locale`.
 *
 * - `null` or an empty string CLEARS it ("same as the organization") — the form
 *   sends "" for its first option, and that must mean "no choice", not "refuse";
 * - one of SUPPORTED_LOCALES, in any case and with surrounding space, is stored
 *   lower-case;
 * - anything else is REFUSED rather than dropped. Unlike a phone reporting
 *   "de-AT", this is a person choosing from a list, so a value that is not on
 *   the list is a bug or a forged request, and saving the rest of the record
 *   while silently ignoring it would say "saved" about something that was not.
 *
 * Regions ("de-AT") are refused for the same reason: the list offers none, and
 * storing one would make two spellings of the same answer.
 */
export type ClientLocaleInput =
  | { ok: true; locale: SupportedLocale | null }
  | { ok: false };

export function parseClientLocale(value: unknown): ClientLocaleInput {
  if (value === null) return { ok: true, locale: null };
  if (typeof value !== 'string') return { ok: false };
  const v = value.trim().toLowerCase();
  if (v === '') return { ok: true, locale: null };
  return isSupportedLocale(v) ? { ok: true, locale: v } : { ok: false };
}

export const CLIENT_LOCALE_INVALID_MESSAGE = 'Unsupported language for emails';

/*
  "Language for emails" as a FORM holds it — shared by the web client form and
  the phone's, so the two cannot offer different lists or save "not set"
  differently. (The web kept its own copy first; the phone needing the same
  four rules is what moved them here.)
*/

/**
 * Each language named in itself, the way a language picker is read: the person
 * choosing may be setting it for a client whose language they do not speak.
 */
export const CLIENT_LOCALE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
};

/** The choices — exactly what the server accepts, so a form never offers a value the save refuses. */
export const CLIENT_LOCALE_OPTIONS: ReadonlyArray<{ value: SupportedLocale; label: string }> = SUPPORTED_LOCALES.map(
  (code) => ({ value: code, label: CLIENT_LOCALE_NAMES[code] }),
);

/**
 * The form's value for a record: its language, or "" when none is set. "" is
 * "same as the organization" — resolved at send time, never guessed into the
 * record. A stored value that is not on the list opens as not set, rather than
 * as an option that does not exist.
 */
export function clientLocaleFormValue(customer?: { locale?: string | null } | null): SupportedLocale | '' {
  const parsed = parseClientLocale(customer?.locale ?? null);
  return parsed.ok && parsed.locale ? parsed.locale : '';
}

/** What a save sends: the chosen language, or null to clear it — never "". */
export function clientLocalePayload(value: string | null | undefined): SupportedLocale | null {
  const parsed = parseClientLocale(value ?? null);
  return parsed.ok ? parsed.locale : null;
}

/** A language's own name for a record's details, or null when none is set. */
export function clientLocaleName(locale?: string | null): string | null {
  const value = clientLocaleFormValue({ locale });
  return value ? CLIENT_LOCALE_NAMES[value] : null;
}

/*
  The organization's language, where its COUNTRY states one.

  The Organization record has no language column — only a country. A country is
  not a language, so this answers only where the country has exactly one
  official language among the ones we write: an Austrian supplier's clients are
  written to in German by default. Switzerland, Belgium, Luxembourg and Canada
  answer nothing, because any single guess there is wrong for a large share of
  the clients it would be applied to — and a wrong language is worse than
  English, which at least reads as "not chosen".

  English-speaking countries are not listed: English is where the chain ends
  anyway.

  Only ever the THIRD answer for a client (after their own account and what the
  office set on the record). It is never used for a member: a workforce is not
  its employer's country, and member mail stays on the member's own choice.
*/
const COUNTRY_LANGUAGE: Record<string, SupportedLocale> = {
  AT: 'de', DE: 'de', LI: 'de',
  FR: 'fr', MC: 'fr',
  IT: 'it', SM: 'it', VA: 'it',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es',
  GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es',
  CR: 'es', PA: 'es', UY: 'es',
};

export function organizationLocaleFromCountry(country: string | null | undefined): SupportedLocale | null {
  if (!country) return null;
  return COUNTRY_LANGUAGE[country.trim().toUpperCase()] ?? null;
}
