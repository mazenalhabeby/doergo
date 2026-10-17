"use client"

import type { ReactNode } from "react"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { OrganizationProfile } from "@/lib/api"
import { formatAmount, formatMoney, MONEY_LOCALE } from "@/lib/money"
import { hoursAndDaysTotals, formatHoursMinutes, lineAmount as roundedLineAmount, type IssuerSnapshot } from "@hbcfield/shared/client"
import { documentIssuer, invoiceDayInstant, invoiceDocumentLabels } from "@/lib/invoice-document-locale"
import { useInvoiceDocument, type DocumentView, type DocumentRow, type InvoiceDocumentProps } from "./use-invoice-document"
import { isHeading, HoursDaysSummary, money, fmtDate, ViewToggle } from "./invoice-document-helpers"
import { InvoiceDocumentCreate } from "./invoice-document-create"
export { money, fmtDate } from "./invoice-document-helpers"
export { type DocumentView, type DocumentRow } from "./use-invoice-document"

export function InvoiceDocument(props: InvoiceDocumentProps) {
  const vm = useInvoiceDocument(props)
  const {
    t,
    units,
    view,
    onView,
    frames,
    clientName,
    clientEmail,
    clientAddress,
    issueDate,
    dueDate,
    periodLabel,
    currency,
    taxPct,
    discount,
    notes,
    items,
    subtotal,
    taxAmount,
    total,
    invoiceNumber,
    from,
    logoUrl,
    showing,
    lineAmount,
    hasDiscount,
  } = vm

  return (
    <>
      {frames === "both" && <ViewToggle view={view} onView={onView} />}

      {/*
        ⚠️ BOTH SHEETS ARE RENDERED AND ONE IS HIDDEN, rather than swapped.
        Switching frames must not re-run the arithmetic or lose a scroll
        position — and a mounted-then-unmounted table is also where a
        "preview" acquires its own state.
      */}
      <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", showing !== "build" && "hidden")}>
        {/* ── The head band: who, when, how much ─────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7 sm:py-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {invoiceNumber || t("invoices.create.documentEyebrow")}
            </p>
            <p className="mt-1.5 truncate text-lg font-semibold text-foreground">
              {clientName.trim() || t("invoices.create.noClientYet")}
            </p>
            {(clientEmail.trim() || clientAddress.trim()) && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {[clientEmail.trim(), clientAddress.trim()].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* The total is the hero: what the reader looks for first on the
              finished document, and what the author is deciding about. */}
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("invoices.create.total")}
            </p>
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {money(total, currency)}
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {t("invoices.create.issueDate")} {fmtDate(issueDate)}
              {dueDate && ` · ${t("invoices.create.dueDate")} ${fmtDate(dueDate)}`}
            </p>
          </div>
        </div>

        {/* ── The lines ──────────────────────────────────────────────── */}
        {items.length === 0 ? (
          /*
            An empty document says what to do next. A blank table with column
            headings and no rows reads as something broken rather than as
            something not started.
          */
          <div className="px-5 py-12 text-center sm:px-7">
            <p className="text-sm text-muted-foreground">{t("invoices.create.emptyDocument")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("invoices.create.emptyDocumentHint")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="px-5 pt-4 sm:px-7"><HoursDaysSummary items={items} currency={currency} /></div>
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 text-left font-medium sm:px-7">{t("invoices.create.descriptionCol")}</th>
                  <th className="w-20 px-2 py-2.5 text-right font-medium">{t("invoices.create.qty")}</th>
                  <th className="w-28 px-2 py-2.5 text-right font-medium">{t("invoices.create.unitPrice")}</th>
                  <th className="w-32 px-5 py-2.5 text-right font-medium sm:px-7">{t("invoices.create.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => isHeading(row) ? (
                  <tr key={`h-${i}`} className="border-b border-border">
                    <td
                      colSpan={4}
                      className={"bg-muted/40 px-5 pb-1.5 pt-3 text-[11px] font-semibold uppercase " +
                        "tracking-[0.12em] text-muted-foreground sm:px-7"}>
                      {row.description}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={`${row.taskId ?? "line"}-${i}`}
                    className={cn("border-b border-border/50 last:border-0", row.descriptive && "text-muted-foreground")}
                  >
                    <td className={cn("px-5 py-2.5 sm:px-7", row.descriptive && "pl-9 sm:pl-12")}>
                      {row.descriptive && <span className="mr-1.5 opacity-40">↳</span>}
                      {units.tag(row)}
                      {row.description}
                      {row.lineKind === "HOURS" && row.hoursBasis && (props.renderBasis ? props.renderBasis(row) : (
                        <span
                          className={"ml-2 rounded-full bg-muted px-2 py-0.5 align-[1px] text-[10px] " +
                            "font-semibold text-muted-foreground"}>
                          {t(`scheduling.membersPage.basis.${row.hoursBasis}`)}
                        </span>
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{row.descriptive ? "" : units.qty(row)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                      {row.descriptive
                        ? ""
                        : <>{money(row.unitPrice, currency)}<span className="text-xs text-muted-foreground">{units.per(row)}</span></>}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums sm:px-7">
                      {row.descriptive
                        ? <span className="text-xs">{t("invoices.create.included")}</span>
                        : money(lineAmount(row), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── The reckoning, right-aligned under the amounts column ──── */}
        {items.length > 0 && (
          <div className="flex justify-end border-t border-border bg-muted/20 px-5 py-4 sm:px-7">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("invoices.create.subtotal")}</dt>
                <dd className="tabular-nums">{money(subtotal, currency)}</dd>
              </div>
              {hasDiscount && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("invoices.create.discount")}</dt>
                  <dd className="tabular-nums">−{money(Number(discount), currency)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t("invoices.create.tax")} {Number(taxPct) > 0 && `(${taxPct}%)`}
                </dt>
                <dd className="tabular-nums">{money(taxAmount, currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                <dt>{t("invoices.create.total")}</dt>
                <dd className="tabular-nums">{money(total, currency)}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {/*
        THE CLIENT'S COPY — the only surface in this product a customer ever
        sees, and deliberately NOT styled like the app.

        ⚠️ No cards, no muted panels, no UI chrome. Anything that reads as
        software here tells the recipient they are looking at somebody's
        dashboard rather than at a bill. It carries what a real invoice has to
        carry: a letterhead, a number, both parties, terms, and how to pay.
      */}
      <InvoiceDocumentCreate vm={vm} />
    </>
  )
}
