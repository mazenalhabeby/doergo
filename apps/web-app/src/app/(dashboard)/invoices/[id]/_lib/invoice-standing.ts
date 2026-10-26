import type { TFunction } from "i18next"
import type { Invoice } from "@/lib/api"
import { fmtDate } from "../../_components/invoice-document"
import { daysOverdue } from "../../_lib/aging"
import { statusStyle, primaryStep, otherSteps } from "../../_lib/lifecycle"

/**
 * Where one invoice stands, in words: its status label and colours, how much is settled or late,
 * the service period as the client reads it, and which lifecycle steps it offers next.
 */
export function describeInvoice(inv: Invoice, t: TFunction) {
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
    ? { text: t("invoices.detail.paidOn", { date: fmtDate(inv.paidAt) }), tone: "text-shell-accent" }
    : dead
      ? { text: statusLabel, tone: "text-muted-foreground" }
      : overdue
        ? { text: t("invoices.detail.overdueBy", { count: late! }), tone: "text-shell-crit font-semibold" }
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

  return { style, statusLabel, settled, standing, periodLabel, primary, others }
}

/** What `describeInvoice` says about one invoice. */
export type InvoiceStanding = ReturnType<typeof describeInvoice>
