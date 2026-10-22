"use client"

import { keys } from "@/lib/query-keys"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, locationsApi, type InvoiceItem } from "@/lib/api"
import { useOrgLetterhead } from "@/hooks/use-org-letterhead"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { fmtDate, type DocumentRow, type DocumentView } from "../../../_components/invoice-document"
import { useInvoiceHeader, invoiceHeaderBody } from "../../../_components/use-invoice-header"
import { num, type EditableLine } from "../../../_components/invoice-fields"
import { useIssuerPreview } from "@/components/companies/company-select"
import { useExchangeRate } from "../../../_lib/use-exchange-rate"
import { invoiceTotals } from "@hbcfield/shared/client"

/*
  Correcting a draft invoice.

  ⚠️ THE SAME SCREEN AS CREATING ONE. It was not: New Invoice was rebuilt into a
  workbench — a bar, a rail of settings, the document itself as the only lifted
  surface — while this page stayed the stack of five identical cards that design
  had been rejected for, with native date inputs and no sight of the document at
  all. The same person does both jobs twenty minutes apart, and the second one
  looked like a different product.

  It is now the same shell, the same fields, the same line editor and the same
  document, from `_components/`. What differs is only what genuinely differs:
  there is nothing to GATHER here. The lines already exist and are edited
  directly, so the rail has no source, no service period and no grouping.

  DRAFT only, deliberately. A sent invoice is an accounting record: the way to
  change one is to cancel it and issue another, which the detail page already
  offers. Anything else quietly rewrites a document a customer is holding.
*/

const toLine = (i: InvoiceItem): EditableLine => ({
  id: i.id,
  description: i.description,
  quantity: String(i.quantity),
  unitPrice: String(i.unitPrice),
})

/** Same shape the server stores, so a line counts as changed only when it is. */
const sameLine = (a: EditableLine, b: InvoiceItem) =>
  a.description.trim() === b.description && num(a.quantity) === b.quantity && num(a.unitPrice) === b.unitPrice

/** EditInvoiceInner's state and handlers — everything before its markup, moved here unchanged. */
export function useEditInvoiceInner({ id }: Pick<{ id: string }, "id">) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: inv, isLoading } = useQuery({
    queryKey: keys.invoices.detail(id),
    queryFn: () => invoicesApi.getById(id),
  })

  // The letterhead on the client's copy. Same source as the create screen.
  // The profile is ADMIN-only; whoever else invoices reads the main company (hooks/use-org-letterhead).
  const { data: org } = useOrgLetterhead()

  const [view, setView] = useState<DocumentView>("build")
  const header = useInvoiceHeader()
  const {
    clientName,
    setClientName,
    clientEmail,
    setClientEmail,
    clientAddress,
    setClientAddress,
    currency,
    setCurrency,
    issueDate,
    setIssueDate,
    dueDate,
    setDueDate,
    taxPct,
    setTaxPct,
    discount,
    setDiscount,
    notes,
    setNotes,
    loadHeader,
  } = header
  const [lines, setLines] = useState<EditableLine[]>([])
  const [seeded, setSeeded] = useState(false)
  const [showLineTags, setShowLineTags] = useState(true)
  // The company that issues this draft. Changing it renumbers the draft in that company's series.
  const [legalEntityId, setLegalEntityId] = useState<string | null>(null)
  const { data: space } = useQuery({
    queryKey: keys.locations.detail(inv?.spaceId),
    queryFn: () => locationsApi.getById(inv!.spaceId!),
    enabled: !!inv?.spaceId,
  })
  const issuerPreview = useIssuerPreview(legalEntityId ?? space?.legalEntityId ?? inv?.legalEntityId, currency)

  // Seeded once. Re-seeding on every render of a refetched query would discard
  // whatever the person had typed.
  useEffect(() => {
    if (!inv || seeded) return
    loadHeader({
      clientName: inv.clientName ?? "",
      clientEmail: inv.clientEmail ?? "",
      clientAddress: inv.clientAddress ?? "",
      issueDate: inv.issueDate ? inv.issueDate.slice(0, 10) : "",
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : "",
      currency: inv.currency || "EUR",
      taxPct: inv.taxRate != null ? String(inv.taxRate * 100) : "",
      discount: String(inv.discount ?? 0),
      notes: inv.notes ?? "",
    })
    setLines((inv.items ?? []).map(toLine))
    setShowLineTags(inv.showLineTags !== false)
    setLegalEntityId(inv.legalEntityId ?? null)
    setSeeded(true)
  }, [inv, seeded])

  // The rate this draft was saved with — kept until its currency or day changes.
  const exchange = useExchangeRate({
    currency,
    baseCurrency: inv?.baseCurrency ?? user?.orgCurrency ?? "EUR",
    issueDate,
    seed: inv
      ? {
          rate: inv.exchangeRate ?? null,
          source: inv.exchangeRateSource ?? null,
          date: inv.exchangeRateDate ? inv.exchangeRateDate.slice(0, 10) : null,
        }
      : undefined,
    ready: seeded,
  })

  /*
    ⚠️ THE VERY ROWS THE DOCUMENT RENDERS are what the mutation sends. Rebuilt
    is how a screen and a document drift apart, and the drift is invisible until
    somebody is holding both.
  */
  const documentItems: DocumentRow[] = useMemo(
    () =>
      lines.map((l) => ({
        description: l.description,
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
        // A heading stays a heading while the draft is edited.
        lineKind: l.id ? (inv?.items?.find((i) => i.id === l.id)?.lineKind ?? null) : null,
        hoursBasis: l.id ? (inv?.items?.find((i) => i.id === l.id)?.hoursBasis ?? null) : null,
      })),
    [lines, inv?.items],
  )

  // The server's own rule (shared): each line rounded, subtotal = their sum, VAT on it.
  const { subtotal, taxAmount, total } = useMemo(
    () => invoiceTotals(documentItems, num(taxPct) / 100, num(discount)),
    [documentItems, taxPct, discount],
  )

  /** The period this invoice was raised for, as the client reads it. */
  const periodLabel =
    inv?.servicePeriodFrom && inv?.servicePeriodTo
      ? `${fmtDate(inv.servicePeriodFrom)} – ${fmtDate(inv.servicePeriodTo)}`
      : inv?.servicePeriodFrom
        ? t("invoices.create.periodFromOnly", { from: fmtDate(inv.servicePeriodFrom) })
        : inv?.servicePeriodTo
          ? t("invoices.create.periodToOnly", { to: fmtDate(inv.servicePeriodTo) })
          : ""

  const save = useMutation({
    mutationFn: async () => {
      if (!inv) return
      const original = inv.items ?? []

      /*
        Items first, then the header.

        Both halves recalculate: adding or removing a line recomputes the
        subtotal, and changing tax or discount recomputes the total from the
        subtotal it finds. Doing the header first would apply the new tax rate
        to the OLD subtotal and leave the invoice wrong by exactly the
        difference — the kind of error nobody notices until a customer does.
      */
      const kept = new Set(lines.filter((l) => l.id).map((l) => l.id as string))

      for (const item of original) {
        const edited = lines.find((l) => l.id === item.id)
        // Removed outright, or changed — there is no item PATCH, so a change is
        // a remove followed by an add.
        if (!kept.has(item.id) || (edited && !sameLine(edited, item))) {
          await invoicesApi.removeItem(inv.id, item.id)
        }
      }

      for (const line of lines) {
        const item = line.id ? original.find((i) => i.id === line.id) : null
        const isNew = !item
        const isChanged = item && !sameLine(line, item)
        if (isNew || isChanged) {
          await invoicesApi.addItem(inv.id, {
            description: line.description.trim(),
            quantity: num(line.quantity),
            unitPrice: num(line.unitPrice),
            /*
              ⚠️ A CHANGED LINE KEEPS WHAT WORK IT IS. There is no item PATCH,
              so a change is a remove and an add — and the add used to drop the
              job and the days it covered, which let the same job or the same
              days come back on the next invoice. A new price is not new work.
            */
            ...(item && {
              taskId: item.taskId ?? null,
              reportId: item.reportId ?? null,
              lineKind: item.lineKind ?? null,
              workerId: item.workerId ?? null,
              dayFrom: item.dayFrom ? item.dayFrom.slice(0, 10) : null,
              dayTo: item.dayTo ? item.dayTo.slice(0, 10) : null,
              ...(item.taskIds?.length ? { taskIds: item.taskIds } : {}),
              ...(item.hoursBasis ? { hoursBasis: item.hoursBasis } : {}),
              billedDays: item.lineKind === "DAYS" ? num(line.quantity) : null,
            }),
          })
        }
      }

      await invoicesApi.update(inv.id, {
        ...invoiceHeaderBody(header.header),
        ...exchange.payload,
        showLineTags,
        issueDate: issueDate || undefined,
        // An empty tax on a draft keeps what it had.
        taxRate: taxPct.trim() === "" ? undefined : num(taxPct) / 100,
        // Only when it changed: the server then renumbers it in the new company's series.
        ...(legalEntityId !== (inv.legalEntityId ?? null) ? { legalEntityId } : {}),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.invoices.detail(id) })
      queryClient.invalidateQueries({ queryKey: keys.invoices.all() })
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
      notify.success(t("invoices.toast.updated", "Invoice updated"))
      router.push(`/invoices/${id}`)
    },
    onError: (e) => notify.error(errorMessage(e)),
  })

  return {
    t,
    router,
    user,
    inv,
    isLoading,
    org,
    view,
    setView,
    header,
    clientName,
    setClientName,
    clientEmail,
    setClientEmail,
    clientAddress,
    setClientAddress,
    currency,
    setCurrency,
    issueDate,
    setIssueDate,
    dueDate,
    setDueDate,
    taxPct,
    setTaxPct,
    discount,
    setDiscount,
    notes,
    setNotes,
    lines,
    setLines,
    showLineTags,
    setShowLineTags,
    legalEntityId,
    setLegalEntityId,
    space,
    issuerPreview,
    exchange,
    documentItems,
    subtotal,
    taxAmount,
    total,
    periodLabel,
    save,
  }
}
