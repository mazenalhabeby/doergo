/*
 * Money itself is formatted by the shared `formatMoney` (cents in, one cached
 * formatter per locale + currency) — packages/shared/src/utils/money.ts.
 */

/** A calendar day as the member's language writes it — "25 Sep", "25. Sept." — with the year only when it is not this one. */
export function formatDay(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) });
}
