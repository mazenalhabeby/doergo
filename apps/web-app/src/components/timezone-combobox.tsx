"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { cityFromTz } from "@/lib/utils"

/** Full IANA timezone list (falls back to a curated set on old browsers). */
const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/London", "Europe/Berlin", "Europe/Vienna", "Europe/Zurich",
  "Europe/Paris", "Europe/Amsterdam", "Europe/Madrid", "Europe/Rome",
  "Europe/Istanbul", "Europe/Moscow", "Asia/Dubai", "Asia/Kolkata",
  "Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney",
  "Pacific/Auckland", "America/New_York", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Sao_Paulo",
]

function allTimezones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf?.("timeZone")
    if (Array.isArray(all) && all.length) return all
  } catch {
    /* noop */
  }
  return FALLBACK_TIMEZONES
}

/** Current UTC offset for a zone, e.g. "UTC+2" / "UTC+5:30" (reflects DST today). */
function tzOffset(tz: string): string {
  try {
    // en-US is load-bearing here: this PARSES the "GMT+2" offset back out as data.
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value
    return (part || "UTC+0").replace("GMT", "UTC")
  } catch {
    return ""
  }
}

/**
 * Searchable single-select over ALL IANA timezones (~418 via
 * Intl.supportedValuesOf). Shows the friendly city + current UTC offset and
 * matches on city, full zone id, and offset. Used by the space General tab and
 * the create-space form so both pick timezones identically.
 */
export function TimezoneCombobox({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (tz: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const options: ComboboxOption[] = useMemo(
    () =>
      allTimezones().map((tz) => {
        const city = cityFromTz(tz)
        const offset = tzOffset(tz)
        return {
          value: tz,
          label: `${city} · ${tz} (${offset})`,
          keywords: `${offset} ${tz}`,
        }
      }),
    [],
  )

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      placeholder={t("locations.selectTimezone")}
      searchPlaceholder={t("locations.searchTimezone")}
      className={className}
    />
  )
}

/** Fetch the IANA timezone for a coordinate via the gateway geo proxy. */
export async function fetchTimezone(lat: number, lng: number): Promise<string | null> {
  try {
    const geoBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1"
    const res = await fetch(`${geoBase}/geo/timezone?lat=${lat}&lon=${lng}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.timezone === "string" ? data.timezone : null
  } catch {
    return null
  }
}
