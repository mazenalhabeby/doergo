"use client"

import { use } from "react"
import { Loader2 } from "lucide-react"

import { PlanGate } from "@/components/plan-gate"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

import { InvoiceTopBar, InvoiceNotice, InvoiceWorkbench, RailSection } from "../../_components/invoice-shell"
import { InvoiceDocument } from "../../_components/invoice-document"
import { ClientFields, TermsFields, LineEditor, IssuedByField } from "../../_components/invoice-fields"
import { useEditInvoiceInner } from "./use-edit-invoice-inner"

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <PlanGate feature="invoicing">
      <EditInvoiceInner id={id} />
    </PlanGate>
  )
}

function EditInvoiceInner({ id }: { id: string }) {
  const {
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
  } = useEditInvoiceInner({ id })

  if (isLoading || !inv) {
    return (
      <div className="min-h-full bg-background">
        <InvoiceTopBar title={t("invoices.edit.title", "Edit invoice")} onBack={() => router.push("/invoices")} />
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

  const canSave = clientName.trim().length > 0 && documentItems.length > 0 && exchange.valid

  return (
    <div className="min-h-full bg-background">
      <InvoiceTopBar
        title={t("invoices.edit.title", "Edit invoice")}
        subtitle={inv.invoiceNumber}
        status={{ label: t("invoices.status.draft", "Draft") }}
        onBack={() => router.push("/invoices")}
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
          {clientName.trim().length === 0 ? t("invoices.create.needsClient") : t("invoices.create.needsLines")}
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
                clientName={clientName}
                setClientName={setClientName}
                clientEmail={clientEmail}
                setClientEmail={setClientEmail}
                clientAddress={clientAddress}
                setClientAddress={setClientAddress}
              />
            </RailSection>

            <RailSection step={2} title={t("invoices.create.termsSection")}>
              <TermsFields
                issueDate={issueDate}
                setIssueDate={setIssueDate}
                dueDate={dueDate}
                setDueDate={setDueDate}
                currency={currency}
                setCurrency={setCurrency}
                exchange={exchange}
                taxPct={taxPct}
                setTaxPct={setTaxPct}
                discount={discount}
                setDiscount={setDiscount}
              >
                <IssuedByField value={legalEntityId} onChange={setLegalEntityId} autoId={space?.legalEntityId} />
                {/* Saved with the invoice: the client's copy and the PDF follow it. */}
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="line-tags" className="text-xs">
                    {t("invoices.create.lineTags")}
                  </Label>
                  <Switch id="line-tags" checked={showLineTags} onCheckedChange={setShowLineTags} />
                </div>
              </TermsFields>
            </RailSection>

            <RailSection step={3} title={t("invoices.create.notes")}>
              <Label className="sr-only" htmlFor="inv-notes">
                {t("invoices.create.notes")}
              </Label>
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
          showTags={showLineTags}
          view={view}
          onView={setView}
          {...header.header}
          periodLabel={periodLabel}
          items={documentItems}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          invoiceNumber={inv.invoiceNumber}
          org={org}
          issuer={issuerPreview ?? inv.issuer ?? null}
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
