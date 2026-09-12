import { FileCheck, Send, Undo2, CheckCircle, XCircle, type LucideIcon } from "lucide-react"

import type { InvoiceStatus } from "@/lib/api"

/**
 * The life of an invoice, and what to offer at each point in it.
 *
 *     DRAFT ──issue──▶ ISSUED ──mark as sent──▶ SENT ──mark paid──▶ PAID
 *       ▲                │
 *       └──back to draft─┘
 *
 * ⚠️ ISSUED IS THE STEP THAT WAS MISSING, and its absence forced a lie. A
 * draft's PDF carries a DRAFT watermark — correctly, since nobody should pay or
 * file a draft — so the only way to get a clean document to send was to press
 * "Mark as sent" BEFORE sending it. That recorded a delivery that had not
 * happened, and locked the invoice in the same click.
 *
 * Issuing separates "this document is final" from "the client has it". They
 * are two different facts and always were.
 *
 * ⚠️ ISSUED → DRAFT is the only backward step, and it is what makes issuing
 * safe to press: the document is final but nothing has left the building, so
 * unlocking costs nobody anything. Once SENT there is no way back — the remedy
 * for a wrong invoice a customer is holding is a credit note or a cancellation,
 * never a quiet rewrite.
 *
 * ⚠️ ONE TABLE, read by the list row AND the invoice bar. They each had their
 * own idea of what came next and already disagreed about where Cancel lived.
 * A lifecycle spread over two screens is a lifecycle that drifts.
 *
 * ⚠️ This MIRRORS `validTransitions` in auth-service's invoice.service.ts,
 * which is the actual authority — a button this file offers and the server
 * refuses is a dead end a person clicks twice before giving up.
 */

export interface LifecycleStep {
  to: InvoiceStatus
  /** i18n key for the label. */
  labelKey: string
  icon: LucideIcon
  /** Reads as destructive, and sits below a separator. */
  destructive?: boolean
  /**
   * Ask first.
   *
   * ⚠️ Only on the one-way step. Confirming something reversible teaches
   * people to click through dialogs, which is how the dialog that mattered
   * gets clicked through too.
   */
  confirm?: boolean
}

/** The chip's colours. */
export const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-600 dark:text-slate-400" },
  /*
    Amber, because an issued invoice sitting unsent is somebody's to-do — the
    document is finished and the client has not got it. Blue would file it
    alongside SENT, which is the one thing it is not.
  */
  ISSUED: { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-400" },
  SENT: { bg: "bg-blue-100 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-400" },
  PAID: { bg: "bg-green-100 dark:bg-green-500/20", text: "text-green-700 dark:text-green-400" },
  OVERDUE: { bg: "bg-red-100 dark:bg-red-500/20", text: "text-red-700 dark:text-red-400" },
  CANCELED: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-500 dark:text-slate-500" },
  REFUNDED: { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-400" },
}

export const statusStyle = (status?: string | null) =>
  STATUS_STYLE[(status || "DRAFT").toUpperCase()] ?? STATUS_STYLE.DRAFT!

/**
 * The one action this invoice is waiting for.
 *
 * Null once it is settled. Stated as a button rather than buried in a menu:
 * the single action a row exists for must not be the hardest thing on it.
 */
export function primaryStep(status?: string | null): LifecycleStep | null {
  switch ((status || "DRAFT").toUpperCase()) {
    case "DRAFT":
      return { to: "ISSUED", labelKey: "invoices.actions.issue", icon: FileCheck }
    case "ISSUED":
      return { to: "SENT", labelKey: "invoices.actions.send", icon: Send, confirm: true }
    case "SENT":
    case "OVERDUE":
      return { to: "PAID", labelKey: "invoices.actions.markPaid", icon: CheckCircle }
    default:
      return null
  }
}

/** Everything else that can be done from here, for the menu. */
export function otherSteps(status?: string | null): LifecycleStep[] {
  switch ((status || "DRAFT").toUpperCase()) {
    case "ISSUED":
      return [
        { to: "DRAFT", labelKey: "invoices.actions.backToDraft", icon: Undo2 },
        { to: "CANCELED", labelKey: "invoices.actions.cancelInvoice", icon: XCircle, destructive: true },
      ]
    case "SENT":
    case "OVERDUE":
      return [
        { to: "CANCELED", labelKey: "invoices.actions.cancelInvoice", icon: XCircle, destructive: true },
      ]
    default:
      return []
  }
}

/**
 * A draft, and only a draft.
 *
 * ⚠️ Issuing LOCKS the invoice — that is the point of it, and the server
 * refuses every write to anything that is not a draft. The way to correct an
 * issued invoice is to take it back to draft, which is a decision worth making
 * explicitly rather than a side effect of clicking into a field.
 */
export const isEditable = (status?: string | null) => (status || "").toUpperCase() === "DRAFT"
export const isDeletable = isEditable
