"use client"

import { use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { PlanGate } from "@/components/plan-gate"
import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, organizationsApi, type InvoiceItem } from "@/lib/api"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

import { InvoiceTopBar, InvoiceNotice, InvoiceWorkbench, RailSection } from "../../_components/invoice-shell"
import { InvoiceDocument, fmtDate, type DocumentRow, type DocumentView } from "../../_components/invoice-document"
import {
  ClientFields, TermsFields, LineEditor, num,
  type EditableLine,
} from "../../_components/invoice-fields"

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
  a.description.trim() === b.description &&
  num(a.quantity) === b.quantity &&
  num(a.unitPrice) === b.unitPrice

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <PlanGate feature="invoicing">
      <EditInvoiceInner id={id} />
    </PlanGate>
  )
}

function EditInvoiceInner({ id }: { id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: inv, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => invoicesApi.getById(id),
  })

  // The letterhead on the client's copy. Same source as the create screen.
  const { data: org } = useQuery({
    queryKey: ["org-profile"],
    queryFn: () => organizationsApi.getProfile(),
  })

  const [view, setView] = useState<DocumentView>("build")
  const [clientName, setClientName] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [clientAddress, setClientAddress] = useState("")
  const [issueDate, setIssueDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [currency, setCurrency] = useState("EUR")
  const [taxPct, setTaxPct] = useState("")
  const [discount, setDiscount] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<EditableLine[]>([])
  const [seeded, setSeeded] = useState(false)

  // Seeded once. Re-seeding on every render of a refetched query would discard
  // whatever the person had typed.
  useEffect(() => {
    if (!inv || seeded) return
    setClientName(inv.clientName ?? "")
    setClientEmail(inv.clientEmail ?? "")
    setClientAddress(inv.clientAddress ?? "")
    setIssueDate(inv.issueDate ? inv.issueDate.slice(0, 10) : "")
    setDueDate(inv.dueDate ? inv.dueDate.slice(0, 10) : "")
    setCurrency(inv.currency || "EUR")
    setTaxPct(inv.taxRate != null ? String(inv.taxRate * 100) : "")
    setDiscount(String(inv.discount ?? 0))
    setNotes(inv.notes ?? "")
    setLines((inv.items ?? []).map(toLine))
    setSeeded(true)
  }, [inv, seeded])

  /*
    ⚠️ THE VERY ROWS THE DOCUMENT RENDERS are what the mutation sends. Rebuilt
    is how a screen and a document drift apart, and the drift is invisible until
    somebody is holding both.
  */
  const documentItems: DocumentRow[] = useMemo(
    () => lines.map((l) => ({
      description: l.description,
      quantity: num(l.quantity),
      unitPrice: num(l.unitPrice),
    })),
    [lines],
  )

  const subtotal = useMemo(
    () => documentItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    [documentItems],
  )
  const taxAmount = subtotal * (num(taxPct) / 100)
  const total = subtotal + taxAmount - num(discount)

  /** The period this invoice was raised for, as the client reads it. */
  const periodLabel = inv?.servicePeriodFrom && inv?.servicePeriodTo
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
          })
        }
      }

      await invoicesApi.update(inv.id, {
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        currency,
        issueDate: issueDate || undefined,
        // Cleared on purpose stays cleared: the PDF then reads "On receipt"
        // rather than inventing a term nobody agreed.
        dueDate: dueDate || undefined,
        taxRate: taxPct.trim() === "" ? undefined : num(taxPct) / 100,
        discount: num(discount),
        notes: notes.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] })
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      notify.success(t("invoices.toast.updated", "Invoice updated"))
      router.push(`/invoices/${id}`)
    },
    onError: (e) => notify.error(errorMessage(e)),
  })

  if (isLoading || !inv) {
    return (
      <div className="min-h-full bg-background">
        <InvoiceTopBar title={t("invoices.edit.title", "Edit invoice")} onBack={() => router.back()} />
        <InvoiceWorkbench rail={<Skeleton className="h-64 w-full rounded-2xl" />}>
          <Skeleton className="h-[28rem] w-full rounded-2xl" />
        </InvoiceWorkbench>
      </div>
    )
  }

  // Same gate the detail page uses for its destructive actions.
  const canEdit = user?.role === "ADMIN" && inv.status === "DRAFT"

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {t(
            "invoices.edit.onlyDrafts",
            "Only a draft invoice can be edited. Cancel this one and issue another instead.",
          )}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push(`/invoices/${id}`)}>
          {t("common.back", "Back")}
        </Button>
      </div>
    )
  }

  const canSave = clientName.trim().length > 0 && documentItems.length > 0

  return (
    <div className="min-h-full bg-background">
      <InvoiceTopBar
        title={t("invoices.edit.title", "Edit invoice")}
        subtitle={inv.invoiceNumber}
        status={t("invoices.status.draft", "Draft")}
        onBack={() => router.push(`/invoices/${id}`)}
      >
        <Button variant="outline" className="shrink-0" onClick={() => router.push(`/invoices/${id}`)}>
          {t("common.cancel")}
        </Button>
        <Button className="shrink-0" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {t("common.save", "Save")}
        </Button>
      </InvoiceTopBar>

      {!canSave && (
        <InvoiceNotice>
          {clientName.trim().length === 0
            ? t("invoices.create.needsClient")
            : t("invoices.create.needsLines")}
        </InvoiceNotice>
      )}

      <InvoiceWorkbench
        rail={
          <>
            {/*
              ⚠️ NUMBERED FROM 1, not from 2 with a gap where "Bill from" sits
              on the other screen. The steps describe THIS page; borrowing the
              create page's numbering to look identical would have it open at
              step 2 with no step 1 anywhere, which reads as a missing section
              rather than as a section that does not apply.
            */}
            <RailSection step={1} title={t("invoices.create.clientSection")}>
              <ClientFields
                clientName={clientName} setClientName={setClientName}
                clientEmail={clientEmail} setClientEmail={setClientEmail}
                clientAddress={clientAddress} setClientAddress={setClientAddress}
              />
            </RailSection>

            <RailSection step={2} title={t("invoices.create.termsSection")}>
              <TermsFields
                issueDate={issueDate} setIssueDate={setIssueDate}
                dueDate={dueDate} setDueDate={setDueDate}
                currency={currency} setCurrency={setCurrency}
                taxPct={taxPct} setTaxPct={setTaxPct}
                discount={discount} setDiscount={setDiscount}
              />
            </RailSection>

            <RailSection step={3} title={t("invoices.create.notes")}>
              <Label className="sr-only" htmlFor="inv-notes">{t("invoices.create.notes")}</Label>
              <Textarea
                id="inv-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("invoices.create.notesPlaceholder")}
                className="resize-none text-sm"
              />
            </RailSection>
          </>
        }
      >
        <InvoiceDocument
          view={view}
          onView={setView}
          clientName={clientName}
          clientEmail={clientEmail}
          clientAddress={clientAddress}
          issueDate={issueDate}
          dueDate={dueDate}
          periodLabel={periodLabel}
          currency={currency}
          taxPct={taxPct}
          discount={discount}
          notes={notes}
          items={documentItems}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          invoiceNumber={inv.invoiceNumber}
          org={org}
        />

        <LineEditor
          title={t("invoices.edit.lines", "Line items")}
          lines={lines}
          onChange={setLines}
          currency={currency}
          emptyLabel={t("invoices.edit.noLines", "This invoice has no lines yet.")}
        />
      </InvoiceWorkbench>
    </div>
  )
}
