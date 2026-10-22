"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { invoicesApi } from "@/lib/api"
import { useOrgLetterhead } from "@/hooks/use-org-letterhead"
import { notify } from "@/lib/toast"
import type { InvoiceBranding } from "@/lib/invoice-pdf"
import { type LifecycleStep } from "../../_lib/lifecycle"

/** One invoice: the query, its letterhead, the status and delete mutations and the two confirmations. */
export function useInvoiceDetail({ id }: { id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

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

  return {
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
  }
}
