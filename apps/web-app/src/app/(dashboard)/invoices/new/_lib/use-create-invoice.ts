"use client"

import { useMutation, type QueryClient } from "@tanstack/react-query"
import type { TFunction } from "i18next"

import { keys } from "@/lib/query-keys"
import { invoicesApi, customersApi, type Invoice, type InvoiceItemInput } from "@/lib/api"
import { notify } from "@/lib/toast"
import type { useExchangeRate } from "../../_lib/use-exchange-rate"

/** Save the draft — the very rows the document rendered — and, if asked, keep the client. */
export function useCreateInvoice({
  t, router, queryClient, documentItems, spaceId, legalEntityId, source, customerId,
  clientName, clientEmail, clientAddress, currency, exchange, showLineTags, taxPct, discount,
  issueDate, dueDate, periodFrom, periodTo, notes, addToCrm,
}: {
  t: TFunction
  router: { push: (href: string) => void }
  queryClient: QueryClient
  documentItems: Array<InvoiceItemInput & { descriptive?: boolean }>
  spaceId: string | undefined
  legalEntityId: string | null
  source: "space" | "client" | "none"
  customerId: string
  clientName: string
  clientEmail: string
  clientAddress: string
  currency: string
  exchange: ReturnType<typeof useExchangeRate>
  showLineTags: boolean
  taxPct: string
  discount: string
  issueDate: string
  dueDate: string
  periodFrom: string
  periodTo: string
  notes: string
  addToCrm: boolean
}) {
  return useMutation({
    mutationFn: () => {
      const items: InvoiceItemInput[] = []

      /*
        ⚠️ THE VERY LINES THE PREVIEW RENDERED. Not rebuilt here — rebuilt is
        how the screen and the document drift apart, and the drift is invisible
        until a customer compares them.
      */
      /*
        ⚠️ Mapped off `documentItems`, the very list the sheet rendered — not
        rebuilt. Rebuilt is how a preview and a document drift apart, and the
        drift is invisible until a customer is holding both.
      */
      for (const row of documentItems) {
        const { descriptive: _omit, ...item } = row
        void _omit
        items.push(item)
      }
      return invoicesApi.create({
        spaceId,
        // Sent only when chosen — otherwise the server resolves it the same way the screen showed.
        ...(legalEntityId ? { legalEntityId } : {}),
        ...(source === "client" && customerId ? { customerId } : {}),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        currency,
        ...exchange.payload,
        showLineTags,
        taxRate: (Number(taxPct) || 0) / 100,
        discount: Number(discount) || 0,
        issueDate,
        dueDate: dueDate || undefined,
        // Kept on the invoice so it can still say which days it covers long
        // after the gather that built it would return something different.
        servicePeriodFrom: periodFrom || undefined,
        servicePeriodTo: periodTo || undefined,
        notes: notes.trim() || undefined,
        items,
      })
    },
    onSuccess: async (inv: Invoice) => {
      notify.success(t("invoices.create.created"))
      queryClient.invalidateQueries({ queryKey: keys.invoices.all() })
      // What it billed is no longer to bill.
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })

      /*
        Keep the client, if they asked — AFTER the invoice exists, and never
        instead of it.

        ⚠️ A failure here must not cost them the invoice. Adding to the CRM is a
        convenience on top of the thing they came to do; wrapping the two in one
        promise would let a duplicate-name refusal throw away a finished
        invoice. So it is awaited, reported quietly, and moved past either way.
      */
      if (addToCrm && clientName.trim()) {
        try {
          await customersApi.create({
            name: clientName.trim(),
            email: clientEmail.trim() || undefined,
            address: clientAddress.trim() || undefined,
          })
          queryClient.invalidateQueries({ queryKey: keys.customers.lists() })
          notify.success(t("invoices.create.clientAdded"))
        } catch {
          notify.error(t("invoices.create.clientAddFailed"))
        }
      }

      router.push(`/invoices/${inv.id}`)
    },
    onError: (e: Error) => notify.error(e.message),
  })
}
