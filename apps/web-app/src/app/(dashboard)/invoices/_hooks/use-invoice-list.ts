"use client"

import { useCompanies } from "@/components/companies/company-select"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, type Invoice } from "@/lib/api"
import { summarise, byUrgency, daysOverdue, bandFor, isOutstanding, groupByBucket, type AgeBand } from "../_lib/aging"
import { type LifecycleStep } from "../_lib/lifecycle"
import { notify } from "@/lib/toast"
import { useSpaceScope } from "@/hooks/use-space-scope"
import { keys } from "@/lib/query-keys"

/** The invoice list's state: its filters, the query, the two mutations and what the screen derives from them. */
export function useInvoiceList() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === "ADMIN"

  /*
    The row being deleted, not a boolean. Deleting was a bare menu item that
    fired on click — in a dropdown, which is exactly where a mis-tap lands —
    and the dialog has to be able to say WHICH invoice and for how much.
  */
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  /**
   * The one-way step, held until it is confirmed.
   *
   * ⚠️ Confirmed HERE too, not only on the invoice page. Marking sent from a
   * list row is the easiest place in the product to do it by accident — the
   * button sits inches from Mark Paid and the document is not even on screen.
   */
  const [sendTarget, setSendTarget] = useState<{ inv: Invoice; step: LifecycleStep } | null>(null)
  const [statusFilter, setStatusFilter] = useState("__all__")
  // Which company issued them — offered only when the organization invoices as more than one.
  const [companyFilter, setCompanyFilter] = useState("__all__")
  const { companies, hasSeveral: severalCompanies } = useCompanies()
  const [search, setSearch] = useState("")
  /**
   * One ageing band, chosen from the summary.
   *
   * ⚠️ The legend used to be five inert labels: a person read "90+ days
   * €13,450" and then had to find those invoices by hand in a list of fifty.
   * Reading a figure and acting on it were two different jobs on one screen.
   */
  const [bandFilter, setBandFilter] = useState<AgeBand | null>(null)

  /*
    WHICH WORKSPACE'S BOOK.

    ⚠️ Invoices were a TAB inside one workspace's settings — Spaces → a
    workspace → Configure → Invoices, and the same four steps again for the
    next one. Clients, assets and portals made this move already: they are what
    a workspace HAS, not how it is configured, and that page is configuration.
    Invoices are the same thing and were left behind, with the note that
    "per-space billing IS a setting" — which was true of the module and never
    of the invoices.

    ⚠️ Filtered by KIND, not by a module. You invoice a customer site, never
    your own warehouse, and offering an internal workspace would be a tab
    leading to a screen where nothing can be created.
  */
  const scope = useSpaceScope({ kind: "CUSTOMER" })

  /** Take a step, asking first where the lifecycle says to. */
  const step = (inv: Invoice, s: LifecycleStep) =>
    s.confirm ? setSendTarget({ inv, step: s }) : statusMutation.mutate({ id: inv.id, status: s.to })

  const { data, isLoading } = useQuery({
    queryKey: keys.invoices.list(statusFilter, companyFilter, scope.spaceId),
    queryFn: () =>
      invoicesApi.list({
        status: statusFilter !== "__all__" ? statusFilter : undefined,
        legalEntityId: companyFilter !== "__all__" ? companyFilter : undefined,
        spaceId: scope.spaceId ?? undefined,
        limit: 50,
      }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => invoicesApi.updateStatus(id, status),
    onSuccess: () => {
      notify.success(t("invoices.toast.statusUpdated"))
      queryClient.invalidateQueries({ queryKey: keys.invoices.all() })
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.delete(id),
    onSuccess: () => {
      notify.success(t("invoices.toast.deleted"))
      queryClient.invalidateQueries({ queryKey: keys.invoices.all() })
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const invoices: Invoice[] = data?.data ?? []
  const needle = search.trim().toLowerCase()
  const filtered = invoices.filter((inv) => {
    if (
      needle &&
      !(
        inv.invoiceNumber?.toLowerCase().includes(needle) ||
        inv.clientName?.toLowerCase().includes(needle) ||
        inv.clientEmail?.toLowerCase().includes(needle)
      )
    )
      return false
    /*
      ⚠️ A band only describes money that is OWED. Applying it to a paid or
      draft invoice would put settled rows under "90+ days", which is the one
      reading this figure must never produce.
    */
    if (bandFilter && (!isOutstanding(inv) || bandFor(daysOverdue(inv.dueDate)) !== bandFilter)) return false
    return true
  })

  // Most urgent first. A list ordered by invoice number says nothing about what
  // to do next, which is the only question this page exists to answer.
  const rows = [...filtered].sort((a, b) => byUrgency(a, b))

  /*
    Ageing, not four disconnected numbers.

    The old summary counted overdue INVOICES, so five days late and four months
    late were the same fact. They are different problems — a reminder versus a
    phone call — and the age is what decides which. It also mixed money with
    counts across the four cards, so nothing could be compared with anything.
  */
  const aging = summarise(invoices)
  /*
    The summary figures were printed with formatCurrency's DEFAULT — dollars —
    while every row printed the invoice's own currency. The screen showed
    $23,610.50 above a list of euro amounts, which on a money screen is not a
    cosmetic slip.
  */
  const ccy = aging.currencies[0] ?? invoices[0]?.currency ?? "EUR"
  const mixedCurrencies = aging.currencies.length > 1
  /*
    Finished documents the client has not been given — the pile the ISSUED
    state created. Nothing else on this page would show them: they are not
    late, and they are not drafts.
  */
  const awaiting = invoices.filter((i) => i.status === "ISSUED").length

  const groups = groupByBucket(rows)
  const filtering =
    search.trim() !== "" || statusFilter !== "__all__" || companyFilter !== "__all__" || bandFilter !== null

  return {
    isAdmin,
    deleteTarget,
    setDeleteTarget,
    sendTarget,
    setSendTarget,
    statusFilter,
    setStatusFilter,
    companyFilter,
    setCompanyFilter,
    companies,
    severalCompanies,
    search,
    setSearch,
    bandFilter,
    setBandFilter,
    scope,
    step,
    isLoading,
    statusMutation,
    deleteMutation,
    invoices,
    rows,
    aging,
    ccy,
    mixedCurrencies,
    awaiting,
    groups,
    filtering,
  }
}

/** The list's state, as the page holds it. */
export type InvoiceListState = ReturnType<typeof useInvoiceList>
