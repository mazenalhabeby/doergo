/**
 * Regression suite for the shared date formatter (audit MD-F1 / MD-E1).
 *
 * The bug this replaces: 27 sites formatted dates with a hardcoded "en-US", so a
 * German user read a German page with an English date on it, and relative time
 * existed four times over — once with untranslated English literals.
 */
import i18n from "@/i18n"
import {
  dateLocale,
  formatDayMonth,
  formatMonthYear,
  formatMediumDate,
  formatTimeAgo,
  formatRelativeDay,
} from "../format-date"

const REF = new Date("2026-08-24T12:00:00Z")

describe("format-date", () => {
  const originalLang = i18n.language
  afterEach(async () => {
    await i18n.changeLanguage(originalLang)
    jest.useRealTimers()
  })

  describe("locale follows the UI language", () => {
    it("reports the active language, not en-US", async () => {
      await i18n.changeLanguage("de")
      expect(dateLocale()).toBe("de")
    })

    it("formats the same date differently per language", async () => {
      await i18n.changeLanguage("en")
      const en = formatMediumDate(REF)
      await i18n.changeLanguage("de")
      const de = formatMediumDate(REF)
      // Both name August; only the English one spells it "Aug " with US ordering.
      expect(en).not.toEqual(de)
      expect(de).toMatch(/2026/)
    })

    it("never falls back to a hardcoded en-US for an unsupported tag", async () => {
      await i18n.changeLanguage("it")
      expect(dateLocale()).toBe("it")
      expect(formatMonthYear(REF)).toMatch(/2026/)
    })
  })

  describe("formatDayMonth", () => {
    it("omits the year for a date in the current year", () => {
      jest.useFakeTimers().setSystemTime(REF)
      expect(formatDayMonth(REF)).not.toMatch(/2026/)
    })
    it("includes the year for a date in another year", () => {
      jest.useFakeTimers().setSystemTime(REF)
      expect(formatDayMonth(new Date("2024-03-02T00:00:00Z"))).toMatch(/2024/)
    })
    it("honours an explicit withYear override", () => {
      jest.useFakeTimers().setSystemTime(REF)
      expect(formatDayMonth(REF, true)).toMatch(/2026/)
    })
  })

  describe("formatTimeAgo", () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(REF))

    const ago = (ms: number) => formatTimeAgo(new Date(REF.getTime() - ms))

    it("returns translated output, never an English literal, in German", async () => {
      await i18n.changeLanguage("de")
      expect(ago(0)).toBe(i18n.t("common.timeAgo.justNow"))
      expect(ago(2 * 86_400_000)).toBe(i18n.t("common.timeAgo.days", { count: 2 }))
      // The pre-fix implementation hardcoded these two.
      expect(ago(86_400_000)).not.toBe("Yesterday")
      expect(ago(0)).not.toBe("Just now")
    })

    it("steps through the granularities in order", () => {
      expect(ago(30_000)).toBe(i18n.t("common.timeAgo.justNow"))
      expect(ago(5 * 60_000)).toBe(i18n.t("common.timeAgo.minutes", { count: 5 }))
      expect(ago(3 * 3_600_000)).toBe(i18n.t("common.timeAgo.hours", { count: 3 }))
      expect(ago(86_400_000)).toBe(i18n.t("common.timeAgo.yesterday"))
      expect(ago(3 * 86_400_000)).toBe(i18n.t("common.timeAgo.days", { count: 3 }))
    })

    it("switches to an absolute date past a week, where 'Nd ago' stops helping", () => {
      const out = ago(30 * 86_400_000)
      expect(out).not.toMatch(/ago/i)
      expect(out).toEqual(formatDayMonth(new Date(REF.getTime() - 30 * 86_400_000)))
    })
  })

  describe("formatRelativeDay", () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(REF))

    it("says today for anything inside the last day", () => {
      expect(formatRelativeDay(new Date(REF.getTime() - 3_600_000))).toBe(i18n.t("common.today"))
    })

    it("does not report minutes — day granularity only", () => {
      expect(formatRelativeDay(new Date(REF.getTime() - 5 * 60_000))).toBe(i18n.t("common.today"))
    })

    it("names yesterday and then counts days", () => {
      expect(formatRelativeDay(new Date(REF.getTime() - 86_400_000))).toBe(
        i18n.t("common.timeAgo.yesterday"),
      )
      expect(formatRelativeDay(new Date(REF.getTime() - 4 * 86_400_000))).toBe(
        i18n.t("common.timeAgo.days", { count: 4 }),
      )
    })
  })
})
