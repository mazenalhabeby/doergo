"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { OrganizationProfile } from "@/lib/api"
import { formatMoney } from "@/lib/money"

/**
 * The invoice, as a document.
 *
 * ⚠️ NOT A "PREVIEW CARD" AMONG OTHER CARDS — the invoice, laid out as one.
 * Somebody building a bill is trying to answer "what will the client receive",
 * and a stack of form panels never answers it. A sheet does, and it makes a
 * wrong line obvious at a glance.
 *
 * ⚠️ ONE COMPONENT FOR BOTH SCREENS. Creating an invoice and correcting one are
 * the same question about the same artefact; two renderings of it would be two
 * places for the arithmetic, the column order and the empty state to drift, and
 * the drift is invisible until somebody holds a document that disagrees with
 * the screen it was made on.
 *
 * ⚠️ Both views fill their tables from the SAME rows. The client's copy is not
 * a second rendering with its own idea of the numbers — it is the same document
 * in a different frame, which is the only version of this that cannot lie.
 */

/** One row as the document shows it. */
export interface DocumentRow {
  description: string
  quantity: number
  unitPrice: number
  /**
   * Described but not charged — the jobs listed under a per-person line.
   * Priced at zero by the caller; shown as "included" rather than as €0.00,
   * which reads as a mistake.
   */
  descriptive?: boolean
  taskId?: string | null
}

export type DocumentView = "build" | "client"

/*
  ⚠️ The locales are PINNED, not taken from the browser. Both screens, the
  detail page and the generated PDF have always rendered an invoice this way,
  and a document is a record: the same invoice must not read "13 Sept 2026" on
  one machine and "13.09.2026" on another, or "€1.234,56" beside "€1,234.56".
  Currency SYMBOL and code still come from the invoice's own currency field.
*/
export function money(n: number, currency: string) {
  return formatMoney(n, currency)
}

export function fmtDate(d?: string | null) {
  if (!d) return "—"
  const dt = new Date(d)
  return Number.isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export interface InvoiceDocumentProps {
  view: DocumentView
  onView: (view: DocumentView) => void

  clientName: string
  clientEmail?: string
  clientAddress?: string

  issueDate: string
  dueDate?: string
  /** Already formatted by the caller — it knows which ends were set. */
  periodLabel?: string
  currency: string
  taxPct: string
  discount: string
  notes?: string

  items: DocumentRow[]
  subtotal: number
  taxAmount: number
  total: number

  /** The number, once it exists. A draft being created has none yet. */
  invoiceNumber?: string | null
  org?: OrganizationProfile
}

/** The toggle — one document, two frames. */
function ViewToggle({ view, onView }: { view: DocumentView; onView: (v: DocumentView) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-center">
      <div className="inline-grid grid-flow-col gap-0.5 rounded-xl border border-border bg-muted/60 p-1">
        {([
          ["build", t("invoices.create.viewWorking")],
          ["client", t("invoices.create.viewClient")],
        ] as const).map(([key, label]) => (
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

export function InvoiceDocument(props: InvoiceDocumentProps) {
  const { t } = useTranslation()
  const {
    view, onView, clientName, clientEmail = "", clientAddress = "",
    issueDate, dueDate, periodLabel, currency, taxPct, discount, notes = "",
    items, subtotal, taxAmount, total, invoiceNumber, org,
  } = props

  const lineAmount = (row: DocumentRow) => (row.quantity || 0) * (row.unitPrice || 0)
  const hasDiscount = Number(discount) > 0

  return (
    <>
      <ViewToggle view={view} onView={onView} />

      {/*
        ⚠️ BOTH SHEETS ARE RENDERED AND ONE IS HIDDEN, rather than swapped.
        Switching frames must not re-run the arithmetic or lose a scroll
        position — and a mounted-then-unmounted table is also where a
        "preview" acquires its own state.
      */}
      <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", view !== "build" && "hidden")}>
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
                {items.map((row, i) => (
                  <tr
                    key={`${row.taskId ?? "line"}-${i}`}
                    className={cn("border-b border-border/50 last:border-0", row.descriptive && "text-muted-foreground")}
                  >
                    <td className={cn("px-5 py-2.5 sm:px-7", row.descriptive && "pl-9 sm:pl-12")}>
                      {row.descriptive && <span className="mr-1.5 opacity-40">↳</span>}
                      {row.description}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{row.descriptive ? "" : row.quantity}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {row.descriptive ? "" : money(row.unitPrice, currency)}
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
      <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", view !== "client" && "hidden")}>
        <div className="px-6 py-8 sm:px-12 sm:py-11">
          {/* Letterhead */}
          <div className="flex flex-wrap justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                  {(org?.name ?? "H").slice(0, 1).toUpperCase()}
                </span>
                <span className="text-[17px] font-bold tracking-tight text-foreground">
                  {org?.name ?? t("invoices.create.yourCompany")}
                </span>
              </div>
              <p className="mt-2.5 whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">
                {[org?.addressLine1, [org?.postalCode, org?.city].filter(Boolean).join(" "), org?.country]
                  .filter(Boolean).join("\n") || t("invoices.create.noCompanyAddress")}
                {org?.vatId ? `\n${org.vatId}` : ""}
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
                {dueDate && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("invoices.create.dueDate")}</dt>
                    <dd className="tabular-nums">{fmtDate(dueDate)}</dd>
                  </div>
                )}
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
                  {items.map((row, i) => (
                    <tr
                      key={`c-${row.taskId ?? "line"}-${i}`}
                      className={cn("border-b border-border/50 last:border-0", row.descriptive && "text-muted-foreground")}
                    >
                      <td className={cn("py-2.5", row.descriptive && "pl-5 text-[12.5px]")}>
                        {row.descriptive && <span className="mr-1.5 opacity-40">↳</span>}
                        {row.description}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{row.descriptive ? "" : row.quantity}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {row.descriptive ? "" : money(row.unitPrice, currency)}
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
                ⚠️ The organisation profile carries no bank details, so this
                says where to add them rather than printing a blank line. An
                invoice with an empty Payment block is worse than one that
                admits the detail is missing — the client cannot pay either
                way, and only one of the two tells anybody why.
              */}
              <p>{t("invoices.create.noBankDetails")}</p>
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
    </>
  )
}
