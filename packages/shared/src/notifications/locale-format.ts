import type { SupportedLocale } from './locale';

/**
 * Numbers and plural forms, the way a reader of each language writes them.
 *
 * Two renderers need exactly this — the push catalogue in notification-service
 * and the email templates here — and they must agree: a push saying "8,5 Std."
 * beside an email saying "8.5 Stunden" to the same German member is the kind of
 * drift that only shows up on somebody's phone. So the Intl objects are built
 * once per locale, in one place.
 */

const numberFormats = new Map<string, Intl.NumberFormat>();

/** At most `maxFractionDigits` decimals, grouped and punctuated per locale. */
export function formatNumberFor(locale: SupportedLocale, n: number, maxFractionDigits = 1): string {
  const key = `${locale}:${maxFractionDigits}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits });
    numberFormats.set(key, f);
  }
  return f.format(n);
}

const pluralRules = new Map<SupportedLocale, Intl.PluralRules>();

/**
 * `one` or `other`.
 *
 * CLDR gives French, Spanish and Italian a "many" form for round millions.
 * Nobody has a million blocked tasks or a million documents waiting; everything
 * that is not "one" is "other", so every catalogue needs exactly two forms.
 */
export function pluralFormFor(locale: SupportedLocale, count: number): 'one' | 'other' {
  let r = pluralRules.get(locale);
  if (!r) {
    r = new Intl.PluralRules(locale);
    pluralRules.set(locale, r);
  }
  return r.select(count) === 'one' ? 'one' : 'other';
}
