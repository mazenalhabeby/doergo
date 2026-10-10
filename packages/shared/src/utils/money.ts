/**
 * Money, in ONE unit: integer CENTS (minor units).
 *
 * ⚠️ The web formatted AMOUNTS (12.5) and the phone CENTS (1250) under the same
 * name, so a value carried from one to the other read 100× wrong with no type
 * error. Every formatter here takes cents; a caller holding an amount converts
 * at the call site with `toCents`, where the unit is visible.
 *
 * ⚠️ `narrowSymbol` — "$", not "US$" (which an en-IE locale prints). Every
 * surface that shows an amount also states the currency code where it matters.
 *
 * ⚠️ Never throws: a bad currency code arrives from real data, and `Intl`
 * raises a RangeError on one.
 */

const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string | undefined, currency: string): Intl.NumberFormat {
  const key = `${locale ?? ''}|${currency}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' });
    } catch {
      // `narrowSymbol` is ES2020 — the wide symbol rather than a bare number.
      f = new Intl.NumberFormat(locale, { style: 'currency', currency });
    }
    cache.set(key, f);
  }
  return f;
}

/** An amount (12.5) as integer cents (1250) — rounded, so 0.1 + 0.2 is 30, not 30.000000000000004. */
export function toCents(amount: number | null | undefined): number {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Integer cents as an amount (1250 → 12.5). */
export function fromCents(cents: number | null | undefined): number {
  const n = Number(cents);
  return Number.isFinite(n) ? n / 100 : 0;
}

/**
 * Cents as money in a locale: formatMoney(123456, 'EUR', 'de') → "1.234,56 €".
 * Currency defaults to EUR; locale undefined = the runtime's.
 */
export function formatMoney(cents: number | null | undefined, currency?: string | null, locale?: string): string {
  const code = (currency || 'EUR').toUpperCase();
  const value = fromCents(cents);
  try {
    return formatter(locale, code).format(value);
  } catch {
    // An unknown code — say the number and the code, and stay on the screen.
    return `${value.toFixed(2)} ${code}`;
  }
}

/** The local symbol alone ("$", "£", "CHF") — for a currency picker's label. Falls back to the code. */
export function currencySymbol(code: string, locale?: string): string {
  try {
    const part = formatter(locale, code.toUpperCase())
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? code;
  } catch {
    return code;
  }
}
