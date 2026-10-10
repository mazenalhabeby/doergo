/**
 * The console's formatters — one for money, one for dates.
 *
 * Local on purpose, not @hbcfield/shared's `formatCents`/`formatShortDate`:
 * those answer a different question. `formatCents` prints "€4186.73" with no
 * grouping and decides decimals by whether the amount is whole, and has no
 * dash for a missing value; `formatShortDate` has no year. The console needs
 * grouped, explicitly rounded-or-exact euros and full dates, so these live
 * HERE and nowhere else in the console.
 */

/**
 * Euros from cents.
 *
 * `exact: false` (tables, headline stats) rounds to whole euros — €4,187 reads
 * better than €4,186.73. `exact: true` is for the places where the number IS
 * the subject (an agreed price, a catalogue price): a figure said out loud to a
 * customer, read back rounded, is how a console and an invoice come to
 * disagree by 47 cents.
 */
export function money(c: number | null | undefined, opts: { exact?: boolean } = {}): string {
  if (c == null || !Number.isFinite(c)) return '—';
  const digits = opts.exact ? 2 : 0;
  return `€${(c / 100).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** A calendar date, or a dash. */
export function date(s: string | Date | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** Short date + time ("Oct 10, 14:05") for feeds and threads. */
export function dateTime(s: string | Date | null | undefined): string {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
