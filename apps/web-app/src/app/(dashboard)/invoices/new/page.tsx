"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { PlanGate } from "@/components/common/plan-gate"
import { Loader2 } from "lucide-react"

import { InvoiceTopBar, InvoiceNotice, InvoiceWorkbench } from "../_components/invoice-shell"
import { InvoiceDocument, type DocumentView } from "../_components/invoice-document"
import { LabourCostPanel } from "../_components/labour-cost-panel"
import { LineEditor } from "../_components/invoice-fields"
import { Button } from "@/components/ui/button"
import { useWorkSource } from "./_hooks/use-work-source"
import { useNewInvoice } from "./_hooks/use-new-invoice"
import { HoursBasisChip } from "./_components/hours-basis-chip"
import { BillableWork } from "./_components/billable-work"
import { NewInvoiceRail } from "./_components/new-invoice-rail"

export default function NewInvoicePage() {
  return (
    <PlanGate feature="invoicing">
      <NewInvoice />
    </PlanGate>
  )
}

/** Raising an invoice: the work it bills (gathered or typed), the client, the terms — and the document itself. */
function NewInvoice() {
  const { t } = useTranslation()
  const router = useRouter()
  const work = useWorkSource()
  const draft = useNewInvoice(work)
  const { header, entries, lineStyle, hourRuns, dayRuns, setDayRuns, setHourRuns, setEntry, createMutation, canSave } =
    draft
  const { documentItems, subtotal, taxAmount, total, org, issuerPreview, manualLines, setManualLines } = draft
  const { showMargin, costRows, workSubtotal, billedInBase, baseCurrency } = draft
  const { includedCount, entryRate, entryLabor, entryParts } = draft
  const { clientName, currency } = header
  const { gather, gatherLoading, spaceId, periodLabel } = work
  /*
    Which face of the document is showing.

    ⚠️ Defaults to the WORKING view, not the client's copy. Somebody arriving
    here is building, not proofing, and opening on a finished-looking letterhead
    invites them to hunt for the controls that made it.
  */
  const [view, setView] = useState<DocumentView>("build")

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

      <InvoiceWorkbench
        rail={
          <NewInvoiceRail
            work={work}
            header={header}
            entries={entries}
            grouping={draft.grouping}
            setGrouping={draft.setGrouping}
            siteMode={draft.siteMode}
            anyWorkRole={draft.anyWorkRole}
            groupByRole={draft.groupByRole}
            setGroupByRole={draft.setGroupByRole}
            lineStyle={lineStyle}
            setLineStyle={draft.setLineStyle}
            currencySource={draft.currencySource}
            setCurrencySource={draft.setCurrencySource}
            exchange={draft.exchange}
            legalEntityId={draft.legalEntityId}
            chooseCompany={draft.chooseCompany}
            autoCompanyId={draft.autoCompanyId}
            rate={draft.rate}
            setRate={draft.setRate}
          />
        }
      >
        {/*
              The document — both frames, from `_components/invoice-document`.

              ⚠️ SHARED WITH THE EDIT SCREEN. Creating an invoice and correcting
              one ask the same question about the same artefact; two renderings
              would be two places for the arithmetic, the column order and the
              empty state to drift, and the drift is invisible until somebody is
              holding a document that disagrees with the screen it was made on.

              ⚠️ It renders `documentItems` — the very rows the mutation sends.
            */}
        <InvoiceDocument
          showTags={lineStyle.tags}
          renderBasis={(row) => {
            const h = hourRuns.find((x) => x.workerId === row.workerId && x.fromDay === row.dayFrom)
            return (
              <HoursBasisChip
                basis={row.hoursBasis}
                hoursByBasis={h?.hoursByBasis}
                spaceId={gather?.spaceId}
                assignmentId={h?.assignmentId}
              />
            )
          }}
          view={view}
          onView={setView}
          {...header.header}
          periodLabel={periodLabel}
          items={documentItems}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          org={org}
          issuer={issuerPreview}
        />

        {/*
          What this invoice makes.

          ⚠️ TWO CONDITIONS, both necessary. `twoRates` says the organisation
          actually works with a cost — a one-rate company must never be shown a
          row of dashes it has to learn to ignore. `canViewLabourCost` says this
          person may know: raising an invoice is an office job, and what the
          labour cost the company is a different question asked by a different
          person.

          The server strips cost from the response on the same permission, so
          this is the screen agreeing with the boundary — not the boundary.
        */}
        {showMargin && (
          <LabourCostPanel
            rows={costRows}
            billed={workSubtotal}
            billedInBase={billedInBase}
            currency={currency}
            baseCurrency={baseCurrency}
            needsRate={billedInBase == null}
          />
        )}

        {/* Billable work (system-sourced) */}
        {spaceId && (
          <BillableWork
            entries={entries}
            dayRuns={dayRuns}
            hourRuns={hourRuns}
            setDayRuns={setDayRuns}
            setHourRuns={setHourRuns}
            setEntry={setEntry}
            gatherLoading={gatherLoading}
            includedCount={includedCount}
            currency={currency}
            entryRate={entryRate}
            entryLabor={entryLabor}
            entryParts={entryParts}
            gatherSpaceId={gather?.spaceId}
          />
        )}

        {/*
          Lines typed by hand — the same editor the edit screen uses for the
          whole of a draft. Two copies of a control over the same shape is how
          one screen's column order and amount format stop matching the other's.
        */}
        <LineEditor
          title={t("invoices.create.extraLines")}
          lines={manualLines}
          onChange={setManualLines}
          currency={currency}
          emptyLabel={t("invoices.create.noExtraLines")}
        />
      </InvoiceWorkbench>
    </div>
  )
}
