"use client"

import { cn } from "@/lib/utils"
import { isHeading, HoursDaysSummary, money, fmtDate } from "./invoice-document-helpers"
import type { InvoiceDocumentState } from "./use-invoice-document"

/** Part of InvoiceDocument's markup, moved here unchanged; it reads the page's state from `vm`. */
export function InvoiceDocumentCreate({ vm }: { vm: InvoiceDocumentState }) {
  const {
    showing,
    logoUrl,
    from,
    t,
    invoiceNumber,
    clientName,
    clientAddress,
    clientEmail,
    issueDate,
    dueDate,
    periodLabel,
    currency,
    items,
    units,
    lineAmount,
    subtotal,
    hasDiscount,
    discount,
    taxPct,
    taxAmount,
    total,
    notes,
  } = vm
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", showing !== "client" && "hidden")}>
      <div className="px-6 py-8 sm:px-12 sm:py-11">
        {/* Letterhead */}
        <div className="flex flex-wrap justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              {/*
                The real mark where there is one — this is the letterhead a
                client receives, and a placeholder initial on an issued
                invoice is the app showing through the document.
              */}
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" decoding="async" className="h-7 max-w-[9rem] object-contain" />
              ) : (
                <span className="grid size-7 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                  {(from.name ?? "H").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-[17px] font-bold tracking-tight text-foreground">
                {from.name ?? t("invoices.create.yourCompany")}
              </span>
            </div>
            <p className="mt-2.5 whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">
              {from.addressLines.join("\n") || t("invoices.create.noCompanyAddress")}
              {from.idLines.length ? `\n${from.idLines.join("\n")}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[26px] font-bold uppercase leading-none tracking-[0.14em] text-foreground">
              {t("invoices.create.documentWord")}
            </p>
            <p className="mt-2 text-[12.5px] tabular-nums text-muted-foreground">
              {invoiceNumber || t("invoices.create.numberPending")}
            </p>
          </div>
        </div>

        {/* Both parties, side by side */}
        <div className="mt-8 grid gap-6 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("invoices.create.billedTo")}
            </p>
            <p className="mt-2 text-[14.5px] font-semibold text-foreground">{clientName.trim() || "—"}</p>
            <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground">
              {[clientAddress.trim(), clientEmail.trim()].filter(Boolean).join("\n")}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("invoices.create.detailsCol")}
            </p>
            <dl className="mt-2 grid gap-1.5 text-[12.5px]">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("invoices.create.issueDate")}</dt>
                <dd className="tabular-nums">{fmtDate(issueDate)}</dd>
              </div>
              {/*
                ⚠️ ALWAYS STATED, never absent and never an em-dash. An
                invoice with no term is payable on receipt — a real and common
                arrangement — and it has to be SAID. A customer cannot act on
                a dash, and an unanswered "when" is the line an unpaid invoice
                is argued over.
              */}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("invoices.create.dueDate")}</dt>
                <dd className="tabular-nums">
                  {dueDate ? fmtDate(dueDate) : t("invoices.create.onReceipt")}
                </dd>
              </div>
              {periodLabel && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("invoices.create.servicePeriod")}</dt>
                  <dd className="tabular-nums">{periodLabel}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("invoices.create.currency")}</dt>
                <dd className="tabular-nums">{currency}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* The lines */}
        {items.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">
            {t("invoices.create.emptyDocument")}
          </p>
        ) : (
          <div className="mt-7 overflow-x-auto">
            <div className="mb-3"><HoursDaysSummary items={items} currency={currency} /></div>
            <table className="w-full min-w-[26rem] text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
                  <th className="py-2 text-left font-medium">{t("invoices.create.descriptionCol")}</th>
                  <th className="w-16 py-2 text-right font-medium">{t("invoices.create.qty")}</th>
                  <th className="w-24 py-2 text-right font-medium">{t("invoices.create.unitPrice")}</th>
                  <th className="w-28 py-2 text-right font-medium">{t("invoices.create.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => isHeading(row) ? (
                  <tr key={`ch-${i}`} className="border-b border-border">
                    <td colSpan={4} className="pb-1.5 pt-4 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {row.description}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={`c-${row.taskId ?? "line"}-${i}`}
                    className={cn("border-b border-border/50 last:border-0", row.descriptive && "text-muted-foreground")}
                  >
                    <td className={cn("py-2.5", row.descriptive && "pl-5 text-[12.5px]")}>
                      {row.descriptive && <span className="mr-1.5 opacity-40">↳</span>}
                      {units.tag(row)}
                      {row.description}
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right tabular-nums">{row.descriptive ? "" : units.qty(row)}</td>
                    <td className="whitespace-nowrap py-2.5 text-right tabular-nums">
                      {row.descriptive
                        ? ""
                        : <>{money(row.unitPrice, currency)}<span className="text-[11px] text-muted-foreground">{units.per(row)}</span></>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {row.descriptive
                        ? <span className="text-[11px]">{t("invoices.create.included")}</span>
                        : money(lineAmount(row), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className="mt-2 flex justify-end">
              <dl className="w-full max-w-[264px] text-[13.5px]">
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">{t("invoices.create.subtotal")}</dt>
                  <dd className="tabular-nums">{money(subtotal, currency)}</dd>
                </div>
                {hasDiscount && (
                  <div className="flex justify-between py-1">
                    <dt className="text-muted-foreground">{t("invoices.create.discount")}</dt>
                    <dd className="tabular-nums">−{money(Number(discount), currency)}</dd>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">
                    {t("invoices.create.tax")} {Number(taxPct) > 0 && `(${taxPct}%)`}
                  </dt>
                  <dd className="tabular-nums">{money(taxAmount, currency)}</dd>
                </div>
                <div className="mt-2 flex justify-between border-t border-border pt-2.5 text-[15.5px] font-semibold">
                  <dt>{t("invoices.create.total")}</dt>
                  <dd className="tabular-nums">{money(total, currency)}</dd>
                </div>
              </dl>
            </div>

            {/* What the recipient is actually looking for. */}
            <div className="mt-4 flex items-baseline justify-between gap-5 rounded-xl bg-brand-600/10 px-4 py-3.5">
              <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                {t("invoices.create.amountDue")}
              </span>
              <span className="text-[19px] font-semibold tabular-nums tracking-tight text-brand-700 dark:text-brand-300">
                {money(total, currency)}
              </span>
            </div>
          </>
        )}

        {/* Terms — how to pay, and anything the biller wanted to say. */}
        <div className="mt-8 grid gap-6 border-t border-border pt-5 text-[12px] leading-relaxed text-muted-foreground sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
              {t("invoices.create.payment")}
            </p>
            {/*
              The issuing company's bank, in the invoice's currency where it has one. With none
              on file this says where to add them rather than printing a blank line — an empty
              Payment block is worse than one that admits the detail is missing.
            */}
            {from.paymentLines.length ? (
              <p className="whitespace-pre-line text-foreground">{from.paymentLines.join("\n")}</p>
            ) : (
              <p>{t("invoices.create.noBankDetails")}</p>
            )}
          </div>
          {notes.trim() && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                {t("invoices.create.notes")}
              </p>
              <p className="whitespace-pre-line">{notes.trim()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
