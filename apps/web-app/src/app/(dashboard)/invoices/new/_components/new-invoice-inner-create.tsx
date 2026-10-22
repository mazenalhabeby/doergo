"use client"

import { InvoiceWorkbench } from "../../_components/invoice-shell"
import { InvoiceDocument } from "../../_components/invoice-document"
import { LabourCostPanel } from "../../_components/labour-cost-panel"
import { LineEditor } from "../../_components/invoice-fields"
import { HoursBasisChip } from "./hours-basis-chip"
import { BillableWork } from "./billable-work"
import type { NewInvoiceInnerState } from "../_hooks/use-new-invoice-inner"
import { NewInvoiceRail } from "./new-invoice-rail"

/** Part of NewInvoiceInner's markup, moved here unchanged; it reads the page's state from `vm`. */
export function NewInvoiceInnerCreate({ vm }: { vm: NewInvoiceInnerState }) {
  const {
    t,
    entries,
    lineStyle,
    currency,
    hourRuns,
    gather,
    view,
    setView,
    header,
    periodLabel,
    documentItems,
    subtotal,
    taxAmount,
    total,
    org,
    issuerPreview,
    showMargin,
    costRows,
    workSubtotal,
    billedInBase,
    baseCurrency,
    spaceId,
    dayRuns,
    setDayRuns,
    setHourRuns,
    setEntry,
    expanded,
    setExpanded,
    gatherLoading,
    includedCount,
    entryRate,
    entryLabor,
    entryParts,
    manualLines,
    setManualLines,
  } = vm
  return (
    <InvoiceWorkbench rail={<NewInvoiceRail vm={vm} />}>
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
          expanded={expanded}
          setExpanded={setExpanded}
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
  )
}
