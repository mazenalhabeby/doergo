/**
 * A file's size as a reader says it: "640 B", "12 KB", "9,2 MB", "1.4 GB".
 *
 * Five screens had a copy, with three different answers for the same file
 * ("9.2 MB" / "9 MB" / "9.2 MB" with a dot in German). One decimal only below
 * ten of a unit, where it carries information; the decimal mark is the
 * reader's (`locale`, undefined = the runtime's).
 */
export function formatFileSize(bytes: number | null | undefined, locale?: string): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 10 ? 1 : 0;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${units[unit]}`;
}
