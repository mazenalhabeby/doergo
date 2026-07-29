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

  const locale = useMemo(() => {
    const lang = i18n.language || "en"
    if (lang.startsWith("de")) return "de-DE"
    if (lang.startsWith("es")) return "es-ES"
    if (lang.startsWith("it")) return "it-IT"
    if (lang.startsWith("fr")) return "fr-FR"
    return "en-US"
  }, [i18n.language])

  const formatTime = useCallback(
    (input: string | number | Date) => formatTimeOfDay(input, hour12, locale),
    [hour12, locale],
  )

  const formatDateTime = useCallback(
    (input: string | number | Date) => formatDateTimeOf(input, hour12, locale),
    [hour12, locale],
  )

  const formatSchedule = useCallback(
    (hhmm: string | null | undefined) => formatClockString(hhmm, hour12),
    [hour12],
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
    /** "5:30 PM" or "17:30" from a raw "HH:MM" schedule string. */
    formatSchedule,
    /** date-fns token for the preference: "h:mm a" (12h) / "HH:mm" (24h). */
    timeToken: clockToken(hour12),
  }
}
