/**
 * Calendar days (`YYYY-MM-DD`) as people read them, and today as one.
 *
 * ⚠️ A day key is a DATE, not an instant: it is read at UTC midnight and
 * formatted in UTC, so no time zone can move "1 Nov" to "31 Oct". Rates start
 * on days and days worked are counted as days — both are calendar facts.
 */

/** "1 Nov 2026" in the reader's language. */
export function formatDayKey(key: string, locale: string, opts: { year?: boolean } = {}): string {
  const d = new Date(`${key}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return key
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(opts.year === false ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(d)
}

// Today in the browser's own calendar: `todayKey()` / `localDateKey(d)` from @hbcfield/shared.
