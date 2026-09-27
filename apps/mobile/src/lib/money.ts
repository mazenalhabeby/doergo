/**
 * Money as the member reads it — in their language's way of writing it.
 *
 * ⚠️ The equipment screens wrote `€${(cents / 100).toFixed(2)}` by hand: always
 * a dot, always the sign in front, while the input beside it asked for "0,00".
 * One formatter, from the locale.
 */
export function formatMoney(cents: number, locale: string, currency = 'EUR'): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency === 'EUR' ? '€' : currency}`;
  }
}

/** A calendar day as the member's language writes it — "25 Sep", "25. Sept." — with the year only when it is not this one. */
export function formatDay(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) });
}
