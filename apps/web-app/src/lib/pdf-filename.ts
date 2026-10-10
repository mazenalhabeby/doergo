/**
 * The name a downloaded document is saved under.
 *
 * `Client_Kind_Number_Period.pdf` — e.g. `BILLA-AG_Invoice_INV-2026-0012_2026-09.pdf`:
 * - the client first, so a folder of invoices groups by who they are for;
 * - dates as ISO (`2026-09`, `2026-09-01_2026-09-15`), so names sort by time;
 * - only `A–Z a–z 0–9 . -` inside a part and `_` between parts — no spaces,
 *   accents or slashes, which mail clients, Windows and accounting imports
 *   each mangle differently ("Müller & Söhne" → `Mueller-Soehne`).
 */
import { localDateKey } from "@hbcfield/shared/client"

const TRANSLITERATE: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss", "&": "and" }

export function fileNamePart(value: string | null | undefined, max = 40): string {
  if (!value) return ""
  const ascii = value
    .replace(/[äöüÄÖÜß&]/g, (c) => TRANSLITERATE[c])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
  return ascii
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, max)
    .replace(/[-.]+$/g, "")
}

/** `YYYY-MM-DD` from a day key, an ISO string or a Date (local day). */
export function dayKeyOf(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
  if (Number.isNaN(value.getTime())) return null
  return localDateKey(value)
}

/**
 * A period as a file-name part: a whole calendar month is `2026-09`, one day is
 * `2026-09-14`, anything else `2026-09-01_2026-09-15`.
 */
export function periodPart(from: string | Date | null | undefined, to: string | Date | null | undefined): string {
  const a = dayKeyOf(from)
  const b = dayKeyOf(to)
  if (a && b) {
    if (a === b) return a
    const [y, m] = a.split("-").map(Number)
    const lastOfMonth = new Date(y, m, 0).getDate()
    if (a.endsWith("-01") && b === `${a.slice(0, 8)}${String(lastOfMonth).padStart(2, "0")}`) return a.slice(0, 7)
    return `${a}_${b}`
  }
  return a ?? b ?? ""
}

/** Join the parts that have something in them, and add `.pdf`. */
export function pdfFileName(parts: Array<string | null | undefined>, fallback = "document"): string {
  const name = parts.map((p) => p ?? "").filter(Boolean).join("_")
  return `${name || fallback}.pdf`
}
