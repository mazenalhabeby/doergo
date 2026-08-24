import i18n from "@/i18n"

/**
 * Locale-aware date and time formatting — one place.
 *
 * The app ships in five languages, but dates were formatted with a hardcoded
 * `"en-US"` in 27 places, so a German user read a German page with an English
 * date on it (audit MD-F1). Meanwhile `customers/[id]`, `service-report-section`
 * and `invoices-tab` had already switched to `i18n.language`, so both patterns
 * were live at once and neither was obviously the right one to copy.
 *
 * Relative time had the same problem four times over: `utils.formatTimeAgo`
 * (English literals — "Just now", "Yesterday", "5d ago"), `dashboard/helpers.timeAgo`
 * (translated, minute granularity), and `members/[id].formatRelativeDate`
 * (translated, day granularity, took `t` as an argument). One implementation now,
 * with the granularity the callers actually needed.
 *
 * NOT covered here, deliberately: `Intl.DateTimeFormat("en-US", { timeZoneName:
 * "shortOffset" })` in the timezone pickers and `getOffsetDtf`. Those parse "GMT+2"
 * back out as DATA — the locale is load-bearing and must stay `en-US`.
 */

/** The active UI language as a BCP-47 tag, safe to hand to Intl. */
export function dateLocale(): string {
  // i18n.language can be a region-qualified tag ("de-AT"); Intl accepts both.
  return i18n.language || "en"
}

/** Full date — "24 August 2026" / "24. August 2026". */
export function formatFullDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString(dateLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

/** Compact date — "24 Aug" / "24. Aug.". Adds the year when it isn't this one. */
export function formatDayMonth(value: string | number | Date, withYear?: boolean): string {
  const d = new Date(value)
  const showYear = withYear ?? d.getFullYear() !== new Date().getFullYear()
  return d.toLocaleDateString(dateLocale(), {
    day: "numeric",
    month: "short",
    ...(showYear ? { year: "numeric" } : {}),
  })
}

/** Compact date with weekday — "Mon, 24 Aug". */
export function formatWeekdayDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString(dateLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

/** Month heading — "August 2026". */
export function formatMonthYear(value: string | number | Date, long = true): string {
  return new Date(value).toLocaleDateString(dateLocale(), {
    month: long ? "long" : "short",
    year: "numeric",
  })
}

/** Medium date — "24 Aug 2026". */
export function formatMediumDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString(dateLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Clock time. `hour12` is passed in by the caller because it is a per-user
 * PREFERENCE (`useTimeFormat`), not a property of the locale — leaving it to the
 * locale would silently override what the member chose in their profile.
 * Omitting it falls back to the locale's own convention.
 */
export function formatClockTime(value: string | number | Date, hour12?: boolean): string {
  return new Date(value).toLocaleTimeString(dateLocale(), {
    hour: "numeric",
    minute: "2-digit",
    ...(hour12 === undefined ? {} : { hour12 }),
  })
}

/** Date + time in one string. */
export function formatDateTime(value: string | number | Date, hour12?: boolean): string {
  const d = new Date(value)
  return `${formatMediumDate(d)}, ${formatClockTime(d, hour12)}`
}

/**
 * "Just now" / "5m ago" / "2h ago" / "Yesterday" / "3d ago", then an absolute
 * date once it is a week old — at which point "9d ago" stops being useful.
 */
export function formatTimeAgo(value: string | number | Date): string {
  const d = new Date(value)
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (mins < 1) return i18n.t("common.timeAgo.justNow")
  if (mins < 60) return i18n.t("common.timeAgo.minutes", { count: mins })
  if (hours < 24) return i18n.t("common.timeAgo.hours", { count: hours })
  if (days === 1) return i18n.t("common.timeAgo.yesterday")
  if (days < 7) return i18n.t("common.timeAgo.days", { count: days })
  return formatDayMonth(d)
}

/**
 * Day-granularity relative date: "Today" / "Yesterday" / "3 days ago", then an
 * absolute date. For "last seen" style fields where minutes are noise.
 */
export function formatRelativeDay(value: string | number | Date): string {
  const d = new Date(value)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return i18n.t("common.today")
  if (days === 1) return i18n.t("common.timeAgo.yesterday")
  if (days < 7) return i18n.t("common.timeAgo.days", { count: days })
  return formatDayMonth(d)
}
