"use client"

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { formatAmount, formatMoney, MONEY_LOCALE } from "@/lib/money"
import { hoursAndDaysTotals, formatHoursMinutes, lineAmount as roundedLineAmount } from "@hbcfield/shared/client"
import { invoiceDayInstant } from "@/lib/invoice-document-locale"
import { type DocumentView, type DocumentRow } from "./invoice-document-types"

/** What both frames of the invoice document share: units, headings, amounts, dates, the summary and the toggle. */

/** A role heading: spans the row, carries no figures. */
export const isHeading = (row: DocumentRow) => row.lineKind === "HEADING"

/**
 * Hours and days, said out loud on every line.
 *
 * ⚠️ A Qty column that means "hours" on one line and "days" on the next is
 * unreadable — "3" at €60 and "3" at €180 look like the same kind of thing.
 * So a charged labour line carries a HOURS / DAYS tag, its quantity carries
 * its unit ("200 h", "20 days") and its price says per hour or per day.
 */
export function useUnits(showTags = true) {
  const { t } = useTranslation()
  return {
    tag: (row: DocumentRow) =>
      !showTags ? null : row.lineKind === "HOURS" ? (
        <span className="mr-2 rounded bg-blue-500/15 px-1.5 py-0.5 align-[1px] text-[10px] font-bold text-blue-700 dark:text-blue-300">
          {t("invoices.create.tagHours")}
        </span>
      ) : row.lineKind === "DAYS" ? (
        <span className="mr-2 rounded bg-teal-500/15 px-1.5 py-0.5 align-[1px] text-[10px] font-bold text-teal-700 dark:text-teal-300">
          {t("invoices.create.tagDays")}
        </span>
      ) : null,
    qty: (row: DocumentRow) =>
      row.lineKind === "HOURS"
        ? formatHoursMinutes(row.quantity)
        : row.lineKind === "DAYS"
          ? t("invoices.create.qtyDays", { count: row.quantity })
          : String(row.quantity),
    per: (row: DocumentRow) =>
      row.lineKind === "HOURS" ? ` ${t("rates.perHour")}` : row.lineKind === "DAYS" ? ` ${t("rates.perDay")}` : "",
  }
}

// Rounded to the cent like the server stores it — the total is the sum of these.
export const lineAmount = (row: DocumentRow) => roundedLineAmount(row.quantity || 0, row.unitPrice || 0)

/** "Hours · 200 h · €5,000 | Days · 20 days · €3,000" — the two figures a reader looks for first. */
export function HoursDaysSummary({ items, currency }: { items: DocumentRow[]; currency: string }) {
  const { t } = useTranslation()
  const tot = hoursAndDaysTotals(
    Array.from(items, (r) => ({
      lineKind: r.lineKind,
      quantity: r.quantity,
      amount: roundedLineAmount(r.quantity, r.unitPrice),
    })),
  )
  if (tot.hours === 0 && tot.days === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {tot.hours > 0 && (
        <span className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
          {t("invoices.create.summaryHours", {
            hours: formatHoursMinutes(tot.hours),
            amount: formatMoney(tot.hoursCents, currency, MONEY_LOCALE),
          })}
        </span>
      )}
      {tot.days > 0 && (
        <span className="rounded-lg bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300">
          {t("invoices.create.summaryDays", {
            count: tot.days,
            amount: formatMoney(tot.daysCents, currency, MONEY_LOCALE),
          })}
        </span>
      )}
    </div>
  )
}

/*
  ⚠️ The locales are PINNED, not taken from the browser. Both screens, the
  detail page and the generated PDF have always rendered an invoice this way,
  and a document is a record: the same invoice must not read "13 Sept 2026" on
  one machine and "13.09.2026" on another, or "€1.234,56" beside "€1,234.56".
  Currency SYMBOL and code still come from the invoice's own currency field.
*/
export function money(n: number, currency: string) {
  return formatAmount(n, currency)
}

/** An invoice DATE (issue / due / period) — read by its UTC day, see `invoiceDayInstant`. */
export function fmtDate(d?: string | null) {
  const dt = invoiceDayInstant(d)
  return dt ? dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—"
}

/** The toggle — one document, two frames. */
export function ViewToggle({ view, onView }: { view: DocumentView; onView: (v: DocumentView) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-center">
      <div className="inline-grid grid-flow-col gap-0.5 rounded-xl border border-border bg-muted/60 p-1">
        {(
          [
            ["build", t("invoices.create.viewWorking")],
            ["client", t("invoices.create.viewClient")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onView(key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-[13px] transition-colors",
              view === key
                ? "bg-card font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
