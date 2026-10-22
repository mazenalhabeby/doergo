import type { Invoice } from "@/lib/api"
import type { InvoicePdfData } from "@/lib/invoice-pdf"
import type { SupportedLocale } from "@hbcfield/shared/client"

/** An invoice as the PDF builder reads it, in the language chosen for the download. */
export function toPdfData(inv: Invoice, locale: SupportedLocale): InvoicePdfData {
  return {
    locale,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    clientName: inv.clientName,
    clientEmail: inv.clientEmail,
    clientAddress: inv.clientAddress,
    currency: inv.currency,
    subtotal: inv.subtotal,
    taxRate: inv.taxRate,
    taxAmount: inv.taxAmount,
    discount: inv.discount,
    total: inv.total,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    servicePeriodFrom: inv.servicePeriodFrom,
    showLineTags: inv.showLineTags,
    servicePeriodTo: inv.servicePeriodTo,
    notes: inv.notes,
    issuer: inv.issuer ?? null,
    items: (inv.items || []).map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: i.amount,
      lineKind: i.lineKind ?? null,
    })),
  }
}
