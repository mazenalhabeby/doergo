/** A curated set for browsers without `Intl.supportedValuesOf` (Safari < 15.4). */
export const FALLBACK_TIMEZONES: readonly string[] = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo",
  "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Europe/Rome",
  "Europe/Amsterdam", "Europe/Zurich", "Europe/Vienna", "Europe/Warsaw", "Europe/Stockholm",
  "Europe/Helsinki", "Europe/Istanbul", "Europe/Moscow",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore",
  "Australia/Sydney", "Pacific/Auckland",
]

/** Every IANA timezone the browser knows (~418), else the curated set. */
export function allTimezones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf?.("timeZone")
    if (Array.isArray(all) && all.length) return all
  } catch {
    /* noop */
  }
  return [...FALLBACK_TIMEZONES]
}

/**
 * The zone's UTC offset today, e.g. "UTC+2" / "UTC+5:30" (reflects DST now);
 * "" for a zone the browser does not know.
 */
export function tzOffset(tz: string, at: Date = new Date()): string {
  try {
    // en-US is load-bearing here: this PARSES the "GMT+2" offset back out as data.
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value
    return (part || "UTC+0").replace("GMT", "UTC")
  } catch {
    return ""
  }
}
