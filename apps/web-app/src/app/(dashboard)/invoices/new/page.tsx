"use client"

import { PlanGate } from "@/components/plan-gate"
import { Loader2 } from "lucide-react"

import { InvoiceTopBar, InvoiceNotice } from "../_components/invoice-shell"
import { Button } from "@/components/ui/button"
import { useNewInvoiceInner } from "./use-new-invoice-inner"
import { NewInvoiceInnerCreate } from "./new-invoice-inner-create"

export default function NewInvoicePage() {
  return (
    <PlanGate feature="invoicing">
      <NewInvoiceInner />
    </PlanGate>
  )
}

function NewInvoiceInner() {
  const vm = useNewInvoiceInner()
  const { t, router, clientName, createMutation, canSave } = vm

  return (
    /*
      ⚠️ THE CHROME RECEDES AND THE DOCUMENT FLOATS ON IT.

      The whole of what was wrong before: controls and invoice sat in identical
      `rounded-2xl border bg-card` slabs, so nothing was more important than
      anything else and the page read as a stack of unrelated panels. A tool and
      the artefact it produces must not weigh the same.

      So the workbench is the recessive ground, the rail holds the settings, and
      the invoice is the only lifted surface on the page.
    */
    <div className="min-h-full bg-background">
      <InvoiceTopBar
        title={t("invoices.create.title")}
        subtitle={clientName.trim() || t("invoices.create.noClientYet")}
        status={{ label: t("invoices.status.draft", "Draft") }}
        onBack={() => router.push("/invoices")}
      >
        <Button
          className="shrink-0"
          disabled={!canSave || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {t("invoices.create.saveDraft")}
        </Button>
      </InvoiceTopBar>

      {!canSave && (
        <InvoiceNotice>
          {clientName.trim().length === 0 ? t("invoices.create.needsClient") : t("invoices.create.needsLines")}
        </InvoiceNotice>
      )}

      <NewInvoiceInnerCreate vm={vm} />
    </div>
  )
}
