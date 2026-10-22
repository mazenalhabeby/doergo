"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { cityFromTz } from "@/lib/utils"
import { geoFetch, type GeoTimezoneAnswer } from "@/lib/geocode"
import { allTimezones, tzOffset } from "@/lib/timezones"

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
    // Authenticated on the gateway — geoFetch carries the token.
    const res = await geoFetch(`/geo/timezone?lat=${lat}&lon=${lng}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as GeoTimezoneAnswer | null
    return typeof data?.timezone === "string" ? data.timezone : null
  } catch {
    return null
  }
}
