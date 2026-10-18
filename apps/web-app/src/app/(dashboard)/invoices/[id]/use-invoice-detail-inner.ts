"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, type Invoice } from "@/lib/api"
import { useOrgLetterhead } from "@/hooks/use-org-letterhead"
import { notify } from "@/lib/toast"
import type { InvoicePdfData, InvoiceBranding } from "@/lib/invoice-pdf"
import { pdfLocaleFor } from "@/lib/invoice-document-locale"
import type { SupportedLocale } from "@hbcfield/shared/client"
import { type LifecycleStep } from "../_lib/lifecycle"

function toPdfData(inv: Invoice, locale: SupportedLocale): InvoicePdfData {
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

/** InvoiceDetailInner's state and handlers — everything before its markup, moved here unchanged. */
export function useInvoiceDetailInner({ id }: Pick<{ id: string }, "id">) {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === "ADMIN"
  const [busy, setBusy] = useState(false)
  const [pdfLocaleOverride, setPdfLocaleOverride] = useState<SupportedLocale | null>(null)

  const { data: inv, isLoading } = useQuery({
    queryKey: keys.invoices.detail(id),
    queryFn: () => invoicesApi.getById(id),
  })
  // The profile is ADMIN-only; whoever else invoices reads the main company (hooks/use-org-letterhead).
  const { data: org } = useOrgLetterhead()

  const statusMutation = useMutation({
    mutationFn: (status: string) => invoicesApi.updateStatus(id, status),
    onSuccess: () => {
      notify.success(t("invoices.toast.statusUpdated"))
      queryClient.invalidateQueries({ queryKey: keys.invoices.detail(id) })
      queryClient.invalidateQueries({ queryKey: keys.invoices.all() })
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
    },
    onError: (e: Error) => notify.error(e.message),
  })
  /*
    Deleting used to happen on one click, from a button sitting beside Print.
    A draft invoice is still an invoice somebody assembled — this one is worth
    €65,625 — and its line items go with it. The dialog names the amount,
    because "delete this draft" and "delete sixty-five thousand euros" are not
    the same sentence to read.
  */
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** The one-way step, held until it is confirmed. */
  const [confirmStep, setConfirmStep] = useState<LifecycleStep | null>(null)

  const deleteMutation = useMutation({
    mutationFn: () => invoicesApi.delete(id),
    onSuccess: () => {
      notify.success(t("invoices.toast.deleted"))
      queryClient.invalidateQueries({ queryKey: keys.invoices.all() })
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
      router.push("/invoices")
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const branding: InvoiceBranding = org ?? {}

  const download = async () => {
    if (!inv) return
    setBusy(true)
    try {
      const { exportInvoicePdf } = await import("@/lib/invoice-pdf")
      await exportInvoicePdf(toPdfData(inv, pdfLocaleFor(inv, pdfLocaleOverride)), branding)
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "PDF failed")
    } finally {
      setBusy(false)
    }
  }
  const print = async () => {
    if (!inv) return
    setBusy(true)
    try {
      const { renderInvoicePdfUrl } = await import("@/lib/invoice-pdf")
      const url = await renderInvoicePdfUrl(toPdfData(inv, pdfLocaleFor(inv, pdfLocaleOverride)), branding)
      const w = window.open(url, "_blank")
      if (w) {
        w.onload = () => {
          try {
            w.focus()
            w.print()
          } catch {
            /* pop-up print blocked */
          }
        }
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "PDF failed")
    } finally {
      setBusy(false)
    }
  }

  return {
    t,
    router,
    isAdmin,
    busy,
    pdfLocaleOverride,
    setPdfLocaleOverride,
    inv,
    isLoading,
    org,
    statusMutation,
    confirmDelete,
    setConfirmDelete,
    confirmStep,
    setConfirmStep,
    deleteMutation,
    branding,
    download,
    print,
  }
}

/** What InvoiceDetailInner and its sections read. */
export type InvoiceDetailInnerState = ReturnType<typeof useInvoiceDetailInner>
