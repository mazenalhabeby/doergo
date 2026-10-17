"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { OrganizationProfile } from "@/lib/api"
import {
  formatHoursMinutes,
  lineAmount as roundedLineAmount,
  type IssuerSnapshot,
} from "@hbcfield/shared/client"
import { documentIssuer, invoiceDocumentLabels } from "@/lib/invoice-document-locale"

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
  /**
   * HEADING = a work-role heading ("Mechanic"): spans the row, carries no
   * figures and charges nothing. It organizes the page; it can never change
   * what the page adds up to.
   */
  lineKind?: "HOURS" | "DAYS" | "HEADING" | null
  /** HOURS runs: which hours were billed. The working view says so; the client's copy does not. */
  hoursBasis?: "COUNTED" | "CLOCKED" | "SHIFT" | null
  /** HOURS runs: whose time and from which day — lets the screen offer the basis switch on the row. */
  workerId?: string | null
  dayFrom?: string | null
}

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

export type DocumentView = "build" | "client"

export interface InvoiceDocumentProps {
  view: DocumentView
  onView: (view: DocumentView) => void
  /**
   * Which frames this screen offers.
   *
   * ⚠️ `client` alone for an invoice that has already been issued. The working
   * view is a BUILDING aid — it answers "are these the right lines"; a document
   * that exists has one true form, and offering a second rendering of it
   * invites the question of which one the client got.
   */
  frames?: "both" | "client"

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
  /**
   * Who it is from — the invoice's company: frozen once issued, live for a draft. Wins over
   * `org`, which is only the fallback for a screen that has no invoice yet.
   */
  issuer?: IssuerSnapshot | null
  /** The real letterhead, where the organisation has uploaded one. */
  logoUrl?: string | null
  /** The HOURS / DAYS tag before each labour line — saved with the invoice. Default shown. */
  showTags?: boolean
  /** Working view: what to show for an hours line's basis (a switch, where the screen can save one). */
  renderBasis?: (row: DocumentRow) => ReactNode
}

/** InvoiceDocument's state and handlers — everything before its markup, moved here unchanged. */
export function useInvoiceDocument(props: InvoiceDocumentProps) {
  const { t, i18n } = useTranslation()
  const units = useUnits(props.showTags !== false)
  const {
    view, onView, frames = "both", clientName, clientEmail = "", clientAddress = "",
    issueDate, dueDate, periodLabel, currency, taxPct, discount, notes = "",
    items, subtotal, taxAmount, total, invoiceNumber, org, issuer, logoUrl: orgLogo,
  } = props
  // The same builder the PDF uses, in the screen's language.
  const from = documentIssuer(issuer, org ?? null, invoiceDocumentLabels(i18n.language))
  const logoUrl = from.logoUrl ?? orgLogo
  const showing: DocumentView = frames === "client" ? "client" : view

  // Rounded to the cent like the server stores it — the total is the sum of these.
  const lineAmount = (row: DocumentRow) => roundedLineAmount(row.quantity || 0, row.unitPrice || 0)
  const hasDiscount = Number(discount) > 0

  return {
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
  }
}

/** What InvoiceDocument and its sections read. */
export type InvoiceDocumentState = ReturnType<typeof useInvoiceDocument>
