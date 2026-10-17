"use client"

import { fmtDate } from "../_components/invoice-document"
import { daysOverdue } from "../_lib/aging"
import { statusStyle, primaryStep, otherSteps, type LifecycleStep } from "../_lib/lifecycle"
import type { useInvoiceDetailInner } from "./use-invoice-detail-inner"

/** What InvoiceDetailInner works out after its early returns, moved here unchanged; called from the same place. */
export function InvoiceDetailInnerView({
  t,
  inv,
  statusMutation,
  setConfirmStep,
}: {
  t: ReturnType<typeof useInvoiceDetailInner>["t"]
  inv: NonNullable<ReturnType<typeof useInvoiceDetailInner>["inv"]>
  statusMutation: ReturnType<typeof useInvoiceDetailInner>["statusMutation"]
  setConfirmStep: ReturnType<typeof useInvoiceDetailInner>["setConfirmStep"]
}) {
  const style = statusStyle(inv.status)
  const statusLabel = t(`invoices.statuses.${(inv.status || "DRAFT").toLowerCase()}`)

  /*
    WHAT A PERSON OPENED THIS PAGE TO KNOW.

    ⚠️ The total used to be the last line of a table at the bottom of the sheet,
    and the state was a 10px chip beside the number. So the two questions an
    invoice is opened for — how much, and where does it stand — were the two
    hardest things on the page to find. The document is still the document; this
    says the answer above it.
  */
  const late = daysOverdue(inv.dueDate)
  const settled = inv.status === "PAID"
  // Cancelled: no longer owed and no longer chased. REFUNDED has a style in
  // the map but is not in `InvoiceStatus` — the map predates the union.
  const dead = inv.status === "CANCELED"
  const overdue = !settled && !dead && late !== null && late > 0

  const standing = settled
    ? { text: t("invoices.detail.paidOn", { date: fmtDate(inv.paidAt) }), tone: "text-green-700 dark:text-green-400" }
    : dead
      ? { text: statusLabel, tone: "text-muted-foreground" }
      : overdue
        ? { text: t("invoices.detail.overdueBy", { count: late! }), tone: "text-red-600 dark:text-red-400" }
        : inv.dueDate
          ? {
              text:
                late === 0 ? t("invoices.detail.dueToday") : t("invoices.detail.dueIn", { count: Math.abs(late ?? 0) }),
              tone: "text-muted-foreground",
            }
          : { text: t("invoices.create.onReceipt"), tone: "text-muted-foreground" }

  const periodLabel =
    inv.servicePeriodFrom && inv.servicePeriodTo
      ? `${fmtDate(inv.servicePeriodFrom)} – ${fmtDate(inv.servicePeriodTo)}`
      : inv.servicePeriodFrom
        ? t("invoices.create.periodFromOnly", { from: fmtDate(inv.servicePeriodFrom) })
        : inv.servicePeriodTo
          ? t("invoices.create.periodToOnly", { to: fmtDate(inv.servicePeriodTo) })
          : ""

  const primary = primaryStep(inv.status)
  const others = otherSteps(inv.status)

  /*
    ⚠️ Only the ONE-WAY step asks first. Issuing is reversible and "back to
    draft" is reversible, so a dialog on those would teach people to click
    through dialogs — which is how the one that matters gets clicked through
    too. Marking as sent cannot be undone, and nothing in this product emails
    the invoice, so the dialog is also where that is said.
  */
  const step = (s: LifecycleStep) => (s.confirm ? setConfirmStep(s) : statusMutation.mutate(s.to))

  return { style, statusLabel, settled, standing, periodLabel, primary, others, step }
}
