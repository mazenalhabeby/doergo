import fs from "fs"
import path from "path"
import {
  ASSET_ENTRY_BACKDATE_DAYS,
  assetEntryDateMessage,
  assetEntryDayBounds,
  localDayKey,
} from "@hbcfield/shared/client"
import { WEB_ENTRY_DATE_KEYS, entryDateText } from "@/components/assets/entry-date"

/**
 * The web's log dialog dates an entry by the SAME rule the server refuses by
 * and the phone's calendar greys out — and says the same sentence.
 *
 * It used to be a native date input capped at today and nothing else: a member
 * could pick a day from last spring, fill in the form, and be refused by the
 * server after the photo had already gone up.
 */

const SRC = path.join(process.cwd(), "src")
const LOCALES = ["en", "de", "es", "fr", "it"] as const
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(SRC, `i18n/locales/${l}.json`), "utf8"))
const at = (obj: any, dotted: string): unknown => dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj)
/** Comments quote the very patterns this forbids. */
const code = (s: string) => s.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:/])\/\/[^\n]*/g, "$1")

// A Monday afternoon, local time.
const now = new Date(2026, 8, 14, 15, 30)
// Echoes the fallback with its count — what an untranslated English screen shows.
const t = (_k: string, fallback: string, o?: Record<string, unknown>) => fallback.replace("{{count}}", String(o?.count ?? ""))

describe("entryDateText", () => {
  it("says nothing about either edge of the offered days", () => {
    const { minDate, maxDate } = assetEntryDayBounds(now)
    expect(entryDateText(t, localDayKey(minDate!), { now })).toBeNull()
    expect(entryDateText(t, localDayKey(maxDate), { now })).toBeNull()
  })

  it("says the server's sentences", () => {
    expect(entryDateText(t, "2026-01-02", { now })).toBe(assetEntryDateMessage("too-old"))
    expect(entryDateText(t, "2026-09-17", { now })).toBe(assetEntryDateMessage("future"))
    expect(entryDateText(t, "2026-02-30", { now })).toBe(assetEntryDateMessage("unreadable"))
  })

  it("lets the office through with last year", () => {
    expect(entryDateText(t, "2025-03-01", { now, canManageAssets: true })).toBeNull()
  })
})

describe("the web's catalogue", () => {
  it("English says exactly what the server says", () => {
    const en = load("en")
    expect(at(en, WEB_ENTRY_DATE_KEYS.future)).toBe(assetEntryDateMessage("future"))
    expect(String(at(en, WEB_ENTRY_DATE_KEYS["too-old"])).replace("{{count}}", String(ASSET_ENTRY_BACKDATE_DAYS)))
      .toBe(assetEntryDateMessage("too-old"))
    expect(at(en, WEB_ENTRY_DATE_KEYS.unreadable)).toBe(assetEntryDateMessage("unreadable"))
  })

  it.each(LOCALES)("%s has every refusal, with the window's count", (loc) => {
    const d = load(loc)
    for (const key of Object.values(WEB_ENTRY_DATE_KEYS)) {
      const v = at(d, key)
      expect(typeof v === "string" && v.trim().length > 0).toBe(true)
    }
    expect(String(at(d, WEB_ENTRY_DATE_KEYS["too-old"]))).toContain("{{count}}")
  })

  it.each(LOCALES)("%s says the same thing the phone does", (loc) => {
    const web = load(loc)
    const phone = JSON.parse(fs.readFileSync(path.join(process.cwd(), `../mobile/src/i18n/locales/${loc}.json`), "utf8"))
    expect(at(web, "assetLog.dateFuture")).toBe(phone.logbook.dateFuture)
    expect(at(web, "assetLog.dateTooOld")).toBe(phone.logbook.dateTooOld)
  })
})

describe("the log dialog", () => {
  const dialog = code(fs.readFileSync(path.join(SRC, "app/(dashboard)/assets/[id]/_components/log-entry-dialog.tsx"), "utf8"))

  it("picks the day on the shared picker, bounded both ways by the rule", () => {
    expect(dialog).toContain("<DatePicker")
    expect(dialog).toMatch(/fromDate=\{bounds\.minDate\}/)
    expect(dialog).toMatch(/toDate=\{bounds\.maxDate\}/)
    expect(dialog).toContain("assetEntryDayBounds(")
    expect(dialog).not.toMatch(/type="date" className="mt-1" value=\{day\}/)
  })

  it("files the day by the shared rule and says the shared sentence", () => {
    expect(dialog).toContain("assetEntryOccurredAt(")
    expect(dialog).toContain("entryDateText(")
    expect(dialog).toContain("assetEntryDateExempt(")
    // The hand-rolled midday this replaced.
    expect(dialog).not.toMatch(/T12:00:00/)
  })

  it("the picker disables before AND after as two matchers — one object would disable the days between", () => {
    const picker = code(fs.readFileSync(path.join(SRC, "components/ui/date-picker.tsx"), "utf8"))
    expect(picker).toMatch(/\{ before: fromDate \}/)
    expect(picker).toMatch(/\{ after: toDate \}/)
    expect(picker).not.toMatch(/\{\s*before: fromDate,\s*after: toDate\s*\}/)
  })
})
