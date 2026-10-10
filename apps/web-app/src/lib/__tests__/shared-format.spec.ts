/**
 * The display helpers in packages/shared (people, file sizes, money, durations,
 * day keys) — imported through the browser entry, as the web and phone do.
 */
import {
  personName,
  personInitials,
  formatFileSize,
  formatMoney,
  toCents,
  fromCents,
  currencySymbol,
  formatDuration,
  formatDurationSeconds,
  localDateKey,
  todayKey,
} from "@hbcfield/shared/client"

describe("personName", () => {
  it("drops missing parts instead of printing them", () => {
    expect(personName({ firstName: "Anna", lastName: "Müller" })).toBe("Anna Müller")
    expect(personName({ firstName: "Anna", lastName: null })).toBe("Anna")
    expect(personName({ firstName: null, lastName: "Müller" })).toBe("Müller")
    expect(personName({ firstName: "  Anna ", lastName: " " })).toBe("Anna")
    expect(personName(null)).toBe("")
    expect(personName(undefined)).toBe("")
  })
  it("falls back to a record's name, and takes a string as a name", () => {
    expect(personName({ name: " BILLA AG " })).toBe("BILLA AG")
    expect(personName({ firstName: "", lastName: "", name: "Siemens" })).toBe("Siemens")
    expect(personName("  Anna   Müller ")).toBe("Anna Müller")
  })
})

describe("personInitials", () => {
  it("takes the first letter of the first and last word", () => {
    expect(personInitials({ firstName: "Anna", lastName: "Müller" })).toBe("AM")
    expect(personInitials("anna maria müller")).toBe("AM")
    expect(personInitials("Anna  Müller")).toBe("AM")
  })
  it("handles a single name, missing parts and nothing at all", () => {
    expect(personInitials({ firstName: "Anna" })).toBe("A")
    expect(personInitials({ lastName: "Müller" })).toBe("M")
    expect(personInitials("Cher")).toBe("C")
    expect(personInitials({ name: "BILLA AG" })).toBe("BA")
    expect(personInitials(null)).toBe("?")
    expect(personInitials("   ")).toBe("?")
    expect(personInitials(undefined, "")).toBe("")
  })
  it("keeps a letter whole and upper-cases it", () => {
    expect(personInitials("öz ümit")).toBe("ÖÜ")
    expect(personInitials("𝒜lice Bob")).toBe("𝒜B")
  })
})

describe("formatFileSize", () => {
  it("names the unit and keeps one decimal only below ten", () => {
    expect(formatFileSize(0, "en")).toBe("0 B")
    expect(formatFileSize(640, "en")).toBe("640 B")
    expect(formatFileSize(1536, "en")).toBe("1.5 KB")
    expect(formatFileSize(12 * 1024, "en")).toBe("12 KB")
    expect(formatFileSize(9.2 * 1024 * 1024, "en")).toBe("9.2 MB")
    expect(formatFileSize(38 * 1024 * 1024, "en")).toBe("38 MB")
    expect(formatFileSize(1.4 * 1024 ** 3, "en")).toBe("1.4 GB")
  })
  it("writes the reader's decimal mark", () => {
    expect(formatFileSize(9.2 * 1024 * 1024, "de")).toBe("9,2 MB")
  })
  it("says nothing for nothing", () => {
    expect(formatFileSize(null)).toBe("")
    expect(formatFileSize(undefined)).toBe("")
    expect(formatFileSize(Number.NaN)).toBe("")
    expect(formatFileSize(-1)).toBe("")
  })
})

describe("money in cents", () => {
  const nb = (s: string) => s.replace(/ | /g, " ")
  it("formats cents per locale and currency", () => {
    expect(nb(formatMoney(123456, "EUR", "de"))).toBe("1.234,56 €")
    expect(formatMoney(123456, "EUR", "en-IE")).toBe("€1,234.56")
    expect(formatMoney(1250, "usd", "en-IE")).toBe("$12.50")
    expect(formatMoney(0, null, "en-IE")).toBe("€0.00")
  })
  it("never throws on a bad code or value", () => {
    expect(formatMoney(1250, "NOPE!", "en-IE")).toBe("12.50 NOPE!")
    expect(formatMoney(Number.NaN, "EUR", "en-IE")).toBe("€0.00")
    expect(formatMoney(null, "EUR", "en-IE")).toBe("€0.00")
  })
  it("converts between amounts and cents without float noise", () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(12.5)).toBe(1250)
    expect(toCents(undefined)).toBe(0)
    expect(fromCents(1250)).toBe(12.5)
    expect(formatMoney(toCents(19.99), "EUR", "en-IE")).toBe("€19.99")
  })
  it("names a currency's symbol", () => {
    expect(currencySymbol("USD", "en-IE")).toBe("$")
    expect(currencySymbol("EUR", "de")).toBe("€")
    expect(currencySymbol("NOPE!", "en")).toBe("NOPE!")
  })
})

describe("durations", () => {
  it("minutes: hours and minutes, no '0m'", () => {
    expect(formatDuration(90)).toBe("1h 30m")
    expect(formatDuration(45)).toBe("45m")
    expect(formatDuration(120)).toBe("2h")
    expect(formatDuration(0)).toBe("0m")
    expect(formatDuration(90.4)).toBe("1h 30m")
    expect(formatDuration(null)).toBe("-")
  })
  it("seconds: keeps seconds", () => {
    expect(formatDurationSeconds(3665)).toBe("1h 1m 5s")
    expect(formatDurationSeconds(125)).toBe("2m 5s")
    expect(formatDurationSeconds(45)).toBe("45s")
    expect(formatDurationSeconds(0)).toBe("0s")
    expect(formatDurationSeconds(-3)).toBe("0s")
    expect(formatDurationSeconds(undefined)).toBe("-")
  })
})

describe("day keys", () => {
  it("is the day in the named zone, not the UTC day", () => {
    // 23:30 UTC on the 14th is 00:30 on the 15th in Vienna (CET).
    const instant = new Date("2026-01-14T23:30:00Z")
    expect(localDateKey(instant, "Europe/Vienna")).toBe("2026-01-15")
    expect(localDateKey(instant, "America/New_York")).toBe("2026-01-14")
    expect(localDateKey("2026-07-01T22:30:00Z", "Europe/Vienna")).toBe("2026-07-02")
  })
  it("uses the runtime's day without a zone, and survives a bad one", () => {
    const d = new Date(2026, 2, 5, 0, 30)
    expect(localDateKey(d)).toBe("2026-03-05")
    expect(localDateKey(d, "Not/AZone")).toBe("2026-03-05")
    expect(localDateKey("nonsense")).toBe("")
  })
  it("today is today", () => {
    expect(todayKey()).toBe(localDateKey(new Date()))
    expect(todayKey("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
