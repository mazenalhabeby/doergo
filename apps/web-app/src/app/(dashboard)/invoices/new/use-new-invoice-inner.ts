"use client"

import { useEffect, useMemo, useRef } from "react"
import { labourCostRows } from "../_lib/labour-cost-rows"
import { useExchangeRate } from "../_lib/use-exchange-rate"
import { type WorkEntry } from "./_lib/draft-model"
import { useDraftLines } from "./_lib/use-draft-lines"
import { useCreateInvoice } from "./_lib/use-create-invoice"
import { useNewInvoiceInnerData } from "./use-new-invoice-inner-data"

/** NewInvoiceInner's state and handlers — everything before its markup, moved here unchanged. */
export function useNewInvoiceInner() {
  // The data part, passed on whole; only what this part reads is named.
  const d = useNewInvoiceInnerData()
  const {
    t,
    i18n,
    router,
    queryClient,
    user,
    source,
    customerId,
    addToCrm,
    grouping,
    setGrouping,
    spaceId,
    header,
    clientName,
    setClientName,
    setClientEmail,
    setClientAddress,
    currency,
    setCurrency,
    issueDate,
    taxPct,
    discount,
    currencySource,
    setCurrencySource,
    legalEntityId,
    setLegalEntityId,
    rate,
    setRate,
    entries,
    setEntries,
    dayRuns,
    hourRuns,
    groupByRole,
    lineStyle,
    manualLines,
    seeded,
    setSeeded,
    linesFrom,
    applyLines,
    gatherSource,
    gather,
    periodFrom,
    periodTo,
    companies,
    autoCompanyId,
  } = d

  /*
    Choosing a company: where the currency only came from the company or the organization (nothing
    closer chose it), follow the new company's — HBC USA invoices in USD unless the workspace says.
  */
  const chooseCompany = (id: string | null) => {
    setLegalEntityId(id)
    if (currencySource === "company" || currencySource === "organization") {
      const c = companies.find((x) => x.id === (id ?? autoCompanyId))
      setCurrency(c?.currency ?? user?.orgCurrency ?? "EUR")
      setCurrencySource(c?.currency ? "company" : "organization")
    }
  }
  const seedKey = JSON.stringify(gatherSource)
  const lastSeedKey = useRef<string | null>(null)
  useEffect(() => {
    if (lastSeedKey.current !== null && lastSeedKey.current !== seedKey) setSeeded(false)
    lastSeedKey.current = seedKey
  }, [seedKey])

  useEffect(() => {
    if (gather && !seeded) {
      const g = gather
      // `?? ""` because these three are nullable on the server. The `as any`
      // let a null through into string state, which turns a controlled input
      // into an uncontrolled one — React warns and the field stops updating.
      if (g.clientName) setClientName((p) => p || g.clientName || "")
      if (g.clientEmail) setClientEmail((p) => p || g.clientEmail || "")
      if (g.clientAddress) setClientAddress((p) => p || g.clientAddress || "")
      if (g.currency) {
        setCurrency(g.currency)
        setCurrencySource(g.currencySource ?? null)
      }
      if (g.rate != null) setRate(String(g.rate))
      applyLines(g, true)
      // A workspace invoice charges time on site per person — "one line per job" does not apply.
      if (g.spaceId) setGrouping((prev) => (prev === "task" ? "member" : prev))
      setSeeded(true)
    }
  }, [gather, seeded])

  /*
    The WORK lines follow the data; what somebody typed does not. When the
    gather answers again (a rate changed, a day was billed elsewhere), the lines
    are rebuilt — keeping each line's include tick and any hours typed over —
    while the client, currency and rate fields are left alone.
  */
  useEffect(() => {
    if (gather && seeded && linesFrom.current !== gather) applyLines(gather)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gather, seeded])

  const rateNum = Number(rate) || 0

  const setEntry = (taskId: string, patch: Partial<WorkEntry>) =>
    setEntries((prev) => prev.map((e) => (e.taskId === taskId ? { ...e, ...patch } : e)))

  /** This entry's own hourly rate in euros, or the form's fallback. */
  const entryRate = (e: WorkEntry) => (e.billRateCents != null ? e.billRateCents / 100 : rateNum)
  // Day-billed work is listed but not charged by the hour — the days pay for it.
  const entryLabor = (e: WorkEntry) => (e.include && e.hoursBillable ? e.hours * entryRate(e) : 0)
  const entryParts = (e: WorkEntry) =>
    e.include && e.includeParts ? e.parts.reduce((s, p) => s + p.quantity * p.unitCost, 0) : 0

  // A WORKSPACE invoice charges each person's time on site; a CLIENT invoice charges job hours.
  const siteMode = !!gather?.spaceId
  const { includedDays, includedHours, anyWorkRole, documentItems, workSubtotal, subtotal, taxAmount, total } =
    useDraftLines({
      entries,
      dayRuns,
      hourRuns,
      manualLines,
      rateNum,
      grouping,
      groupByRole,
      lineStyle,
      siteMode,
      taxPct,
      discount,
      entryParts,
      t,
      language: i18n.language,
    })

  /*
    Cost only ever comes from entries the SERVER resolved — never re-derived
    here. A browser that computed a margin from rates it happened to hold would
    be a second answer to the question the boundary exists to control.
  */
  /*
    One row per person — the cost the SERVER put on each included line, added
    up (never a rate multiplied here). Client invoices cost their jobs by the
    hour; workspace invoices cost hours and days lines.
  */
  const costRows = useMemo(
    () => labourCostRows(includedHours, includedDays, siteMode ? [] : entries, t("invoices.create.unassignedWorker")),
    [entries, includedDays, includedHours, siteMode, t],
  )
  const canViewLabourCost = (user as { canViewLabourCost?: boolean } | null)?.canViewLabourCost === true
  /*
    ⚠️ COSTS ARE IN THE ORGANIZATION'S CURRENCY, the bill in the invoice's. A
    margin subtracts one from the other only through the rate saved with this
    invoice — with no rate there is no margin, never one converted at a guess.
  */
  const baseCurrency = gather?.baseCurrency ?? user?.orgCurrency ?? "EUR"
  const exchange = useExchangeRate({ currency, baseCurrency, issueDate })
  const billedInBase = exchange.toBase(workSubtotal)
  const showMargin = canViewLabourCost && gather?.twoRates === true && costRows.some((r) => r.costCents != null)

  const createMutation = useCreateInvoice({
    t,
    router,
    queryClient,
    documentItems,
    spaceId,
    legalEntityId,
    source,
    customerId,
    header: header.header,
    exchange,
    showLineTags: lineStyle.tags,
    periodFrom,
    periodTo,
    addToCrm,
  })

  const includedCount = entries.filter((e) => e.include).length
  const canSave =
    clientName.trim().length > 0 &&
    exchange.valid &&
    (includedCount > 0 ||
      includedDays.length > 0 ||
      includedHours.length > 0 ||
      manualLines.some((m) => m.description.trim()))

  return {
    ...d,
    chooseCompany,
    setEntry,
    entryRate,
    entryLabor,
    entryParts,
    siteMode,
    anyWorkRole,
    documentItems,
    workSubtotal,
    subtotal,
    taxAmount,
    total,
    costRows,
    baseCurrency,
    exchange,
    billedInBase,
    showMargin,
    createMutation,
    includedCount,
    canSave,
  }
}

/** What NewInvoiceInner and its sections read. */
export type NewInvoiceInnerState = ReturnType<typeof useNewInvoiceInner>
