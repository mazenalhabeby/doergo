"use client"

import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/contexts/auth-context"
import {
  clockToken,
  formatClockString,
  formatDateTimeOf,
  formatTimeOfDay,
} from "@/lib/utils"

/**
 * Per-user 12h / 24h clock preference.
 *
 * The choice lives on the user account (`user.timeFormat`), so it follows the
 * user across devices. This hook is the single entry point every time-of-day
 * display should use — it binds the preference (and the active i18n locale) into
 * ready-to-call formatters, so call sites never hardcode 12h or 24h again.
 *
 * Purely a display concern: it reads an already-loaded field on the user object,
 * so there is zero extra network / DB / render cost.
 */
export function useTimeFormat() {
  const { user } = useAuth()
  const { i18n } = useTranslation()

  const hour12 = user?.timeFormat === "12h"

  // Default display zone = the org's timezone, so times render in a fixed,
  // labeled zone instead of being silently converted to the viewer's browser
  // zone. Attendance call sites override this per-entry with the location's
  // timezone by passing an explicit `tz` argument.
  const orgTz = user?.organizationTimezone || undefined

  const locale = useMemo(() => {
    const lang = i18n.language || "en"
    if (lang.startsWith("de")) return "de-DE"
    if (lang.startsWith("es")) return "es-ES"
    if (lang.startsWith("it")) return "it-IT"
    if (lang.startsWith("fr")) return "fr-FR"
    return "en-US"
  }, [i18n.language])

  const formatTime = useCallback(
    // `tz` overrides the org default (e.g. an attendance entry's location zone).
    // Pass `null` explicitly to opt out of any zone (raw browser-local, no label).
    (input: string | number | Date, tz?: string | null) =>
      formatTimeOfDay(input, hour12, locale, tz === null ? undefined : tz ?? orgTz),
    [hour12, locale, orgTz],
  )

  const formatDateTime = useCallback(
    (input: string | number | Date, tz?: string | null) =>
      formatDateTimeOf(input, hour12, locale, tz === null ? undefined : tz ?? orgTz),
    [hour12, locale, orgTz],
  )

  const formatSchedule = useCallback(
    (hhmm: string | null | undefined) => formatClockString(hhmm, hour12),
    [hour12],
  )

  // Date-only, locale- AND timezone-aware. Use this for a date column that sits
  // next to a zoned time (e.g. attendance) so both agree on the calendar day and
  // the month name follows the active language (was hardcoded en-US, browser-local).
  const formatDate = useCallback(
    (input: string | number | Date, tz?: string | null) =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: tz === null ? undefined : tz ?? orgTz,
      }).format(input instanceof Date ? input : new Date(input)),
    [locale, orgTz],
  )

  return {
    /** true when the user prefers 12-hour (AM/PM) display. */
    hour12,
    /** IETF locale derived from the active language (drives month/day words). */
    locale,
    /** "2:30 PM" or "14:30" from a Date/ISO/epoch. */
    formatTime,
    /** "Jan 15, 2:30 PM" or "Jan 15, 14:30" from a Date/ISO/epoch. */
    formatDateTime,
    /** "Jan 15, 2025" — date only, locale + timezone aware. */
    formatDate,
    /** "5:30 PM" or "17:30" from a raw "HH:MM" schedule string. */
    formatSchedule,
    /** date-fns token for the preference: "h:mm a" (12h) / "HH:mm" (24h). */
    timeToken: clockToken(hour12),
  }
}
