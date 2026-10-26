"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

/**
 * The status filter, drawn as the board's tabs. In lifecycle order, so the list reads the way the work happens.
 * `__all__` is every status — the same value the select used to carry, so the query is unchanged.
 */
const STATUS_TABS = ["__all__", "DRAFT", "ISSUED", "SENT", "PAID", "OVERDUE", "CANCELED"] as const

export function StatusTabs({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <div
      role="tablist"
      aria-label={t("common.status")}
      className="flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none]"
    >
      {STATUS_TABS.map((s) => {
        const on = value === s
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(s)}
            className={cn(
              "-mb-px inline-flex h-11 shrink-0 items-center border-b-2 text-[14.5px] outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "__all__" ? t("common.all") : t(`invoices.statuses.${s.toLowerCase()}`)}
          </button>
        )
      })}
    </div>
  )
}

/** The grid every invoice row sits on — the header and the rows share it, so the columns line up. */
export const INVOICE_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3.5 " +
  "md:grid-cols-[minmax(0,1.6fr)_120px_120px_minmax(0,140px)_auto] " +
  "xl:grid-cols-[minmax(0,1.6fr)_150px_120px_120px_130px_minmax(150px,auto)]"

/** The column names over the list (from md up; on a phone each row says what it is). */
export function InvoiceListHead() {
  const { t } = useTranslation()
  return (
    <div className={cn(INVOICE_GRID, "hidden h-10 px-3.5 text-xs font-medium text-muted-foreground md:grid")}>
      <span>{t("invoices.columns.client")}</span>
      <span className="hidden xl:block">{t("invoices.columns.invoiceNumber")}</span>
      <span>{t("invoices.columns.dueDate")}</span>
      <span>{t("invoices.columns.status")}</span>
      <span className="text-right">{t("invoices.columns.amount")}</span>
      <span className="hidden xl:block" />
    </div>
  )
}
