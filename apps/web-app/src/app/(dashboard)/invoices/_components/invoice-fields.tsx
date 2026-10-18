"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencySelect } from "@/components/rates/currency-setting"
import { formatDayKey } from "@/lib/day-key"
import type { ExchangeRateState } from "../_lib/use-exchange-rate"
export { ClientFields, type EditableLine, num, LineEditor, IssuedByField } from "./line-editor"

/**
 * The controls both invoice screens need, in the form the rail requires.
 *
 * ⚠️ ONE COLUMN, EVERYWHERE. These blocks were written for a full-width form
 * and carried `sm:grid-cols-2` into a 320px rail — where "Issue date" wrapped
 * onto two lines, "Rate (per hour)" onto three, and the currency box showed
 * "EUF". `sm:` asks about the VIEWPORT; what is narrow here is the CONTAINER,
 * and no breakpoint can tell the difference. A layout is not portable just
 * because it is responsive.
 *
 * ⚠️ And the app's own DatePicker, never `<input type="date">`. The native
 * control renders differently in every browser and in a narrow column shows
 * "dd.m" with a clipped spinner. The edit screen still had two of them.
 */
/**
 * Dates, currency, tax and discount.
 *
 * ⚠️ NOT "WHO IT IS FOR". They sat in that card because the old full-width
 * layout had room for a second column and something had to fill it. A section
 * called "who it is for" that also sets the tax rate is one somebody has to
 * read twice to use once.
 */
export function TermsFields({
  issueDate, setIssueDate,
  dueDate, setDueDate,
  currency, setCurrency,
  currencySource,
  exchange,
  taxPct, setTaxPct,
  discount, setDiscount,
  children,
}: {
  issueDate: string
  setIssueDate: (v: string) => void
  dueDate: string
  setDueDate: (v: string) => void
  currency: string
  setCurrency: (v: string) => void
  /** Where the currency came from, when it was filled in rather than chosen. */
  currencySource?: "workspace" | "client" | "company" | "organization" | null
  /** The exchange rate, when the invoice is in another currency than the organization's. */
  exchange?: ExchangeRateState
  taxPct: string
  setTaxPct: (v: string) => void
  discount: string
  setDiscount: (v: string) => void
  /** A screen's own term — the fallback hourly rate, on the create side. */
  children?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="space-y-3">
      {/*
        Stacked, not side by side: two calendar triggers in a 320px rail leave
        no room for either date to be readable.
      */}
      <div>
        <Label className="text-xs" htmlFor="inv-issue">{t("invoices.create.issueDate")}</Label>
        <DatePicker id="inv-issue" value={issueDate} onChange={setIssueDate} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs" htmlFor="inv-due">{t("invoices.create.dueDate")}</Label>
        <DatePicker
          id="inv-due"
          value={dueDate}
          onChange={setDueDate}
          placeholder={t("invoices.create.noDueDate")}
          clearable
          /* A due date before the invoice was issued is not a term, it is a
             typo — and one nobody re-reads on a draft. */
          fromDate={issueDate ? new Date(issueDate) : undefined}
          className="mt-1"
        />
      </div>

      {children}

      {/*
        The currency, from the list the server accepts — a typed box let "EUF"
        through. Filled from the workspace, else the client, else the
        organization, and still changeable for this one invoice.
      */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs" htmlFor="inv-currency">{t("invoices.create.currency")}</Label>
          {currencySource && (
            <span
              className={"rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold " +
                "text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"}>
              {t(`currency.from.${currencySource}`)}
            </span>
          )}
        </div>
        <CurrencySelect id="inv-currency" value={currency} onChange={(c) => c && setCurrency(c)} className="mt-1 h-9 rounded-md" />
      </div>

      {exchange?.differs && (
        <div>
          <Label className="text-xs" htmlFor="inv-rate">{t("currency.rateLabel")}</Label>
          <div className="mt-1 flex items-center gap-2 rounded-md border border-input px-2.5">
            <span className="shrink-0 text-xs text-muted-foreground">1 {currency} =</span>
            <Input
              id="inv-rate"
              inputMode="decimal"
              value={exchange.text}
              onChange={(e) => exchange.setManual(e.target.value)}
              placeholder={exchange.loading ? "…" : "—"}
              aria-invalid={!exchange.valid}
              className="h-8 border-0 px-0 tabular-nums shadow-none focus-visible:ring-0"
            />
            <span className="shrink-0 text-xs text-muted-foreground">{exchange.baseCurrency}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {exchange.loading
              ? t("currency.rateLoading")
              : exchange.source === "ECB" && exchange.date
                ? t("currency.rateFromEcb", { date: formatDayKey(exchange.date, i18n.language) })
                : exchange.source === "MANUAL"
                  ? <>
                      {t("currency.rateManual")}{" "}
                      <button
                        type="button"
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                        onClick={exchange.resetToEcb}>
                        {t("currency.useEcb")}
                      </button>
                    </>
                  : t("currency.rateNone", { from: currency, to: exchange.baseCurrency })}
          </p>
          {!exchange.valid && <p className="mt-1 text-[11px] text-red-600">{t("currency.rateInvalid")}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{t("invoices.create.taxRate")}</Label>
          <Input
            type="number" min={0} value={taxPct}
            onChange={(e) => setTaxPct(e.target.value)}
            className="mt-1 h-9 tabular-nums"
          />
        </div>
        <div>
          <Label className="text-xs">{t("invoices.create.discount")}</Label>
          <Input
            type="number" min={0} value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="mt-1 h-9 tabular-nums"
          />
        </div>
      </div>
    </div>
  )
}
