"use client"

import { keys } from "@/lib/query-keys"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { locationsApi } from "@/lib/api"
import type { LabourGrouping } from "@hbcfield/shared/client"
import { useOrgLetterhead } from "@/hooks/use-org-letterhead"
import { useCompanies, useIssuerPreview } from "@/components/companies/company-select"
import { useInvoiceHeader } from "../../_components/use-invoice-header"
import { type EditableLine } from "../../_components/invoice-fields"
import { labourCostRows } from "../../_lib/labour-cost-rows"
import { useExchangeRate } from "../../_lib/use-exchange-rate"
import { todayIso, type DayRun, type HourRun, type WorkEntry } from "../_lib/draft-model"
import { useLineStyle } from "../_lib/use-line-style"
import { useApplyLines } from "../_lib/use-apply-lines"
import { useDraftLines } from "../_lib/use-draft-lines"
import { useCreateInvoice } from "../_lib/use-create-invoice"
import type { WorkSource } from "./use-work-source"

/**
 * The invoice being drafted from that work: the client and terms, the company, the work lines
 * (seeded from the gather and rebuilt when it answers again), the totals, the labour cost and the save.
 */
export function useNewInvoice(work: WorkSource) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { source, customerId, addToCrm, spaceId, gatherSource, gather, periodFrom, periodTo } = work

  /*
    HOW THE LABOUR IS WRITTEN UP — the customer's preference, not ours.

    A managing agent wants the jobs. A staffing client wants the hours. Somebody
    presenting to a board wants a figure with the detail underneath it. All
    three describe the same work for the same money, so this is a choice about
    the document rather than about the price.
  */
  const [grouping, setGrouping] = useState<LabourGrouping>("task")
  const header = useInvoiceHeader({
    currency: user?.orgCurrency ?? "EUR",
    issueDate: todayIso(),
    taxPct: "20",
    discount: "0",
  })
  const {
    clientName,
    setClientName,
    setClientEmail,
    setClientAddress,
    currency,
    setCurrency,
    issueDate,
    taxPct,
    discount,
  } = header
  // Where the currency came from (workspace → client → organization); cleared once somebody picks one.
  const [currencySource, setCurrencySource] = useState<"workspace" | "client" | "company" | "organization" | null>(null)
  // The company that issues it. null = automatic: the workspace's → the client's → the main one.
  const [legalEntityId, setLegalEntityId] = useState<string | null>(null)
  const [rate, setRate] = useState("") // euros/hour applied to labor lines
  const [entries, setEntries] = useState<WorkEntry[]>([])

  const [dayRuns, setDayRuns] = useState<DayRun[]>([])
  const [hourRuns, setHourRuns] = useState<HourRun[]>([])
  // On by default: where people have trades, the client reads the work by trade.
  const [groupByRole, setGroupByRole] = useState(true)
  // How much a labour line's description says — remembered for the next invoice.
  const { lineStyle, setLineStyle } = useLineStyle()
  const [manualLines, setManualLines] = useState<EditableLine[]>([])
  const [seeded, setSeeded] = useState(false)
  const { linesFrom, applyLines } = useApplyLines({ setEntries, setDayRuns, setHourRuns })

  // Space (for the client header + fallback prefill).
  const { data: space } = useQuery({
    queryKey: keys.locations.detail(spaceId),
    queryFn: () => locationsApi.getById(spaceId!),
    enabled: !!spaceId,
  })

  /*
    The letterhead — this organisation's own details, for the client's copy.

    Cheap and shared: the same query key the rest of the app uses, so opening
    this screen costs no extra request on a warm cache.
  */
  // The profile is ADMIN-only; whoever else invoices reads the main company (hooks/use-org-letterhead).
  const { data: org } = useOrgLetterhead()

  useEffect(() => {
    if (space && !seeded) {
      setClientName((p) => p || space.contactName || space.name || "")
      setClientEmail((p) => p || space.contactEmail || "")
      setClientAddress((p) => p || space.address || "")
    }
  }, [space, seeded])

  /*
    ⚠️ THE SEED LATCH RELEASES WHEN THE SOURCE CHANGES. `seeded` exists so the
    form stops overwriting what somebody has typed — but it also meant that
    picking a second workspace, or switching from a workspace to a client,
    filled in nothing at all and looked broken.
  */
  const { companies, main: mainCompany } = useCompanies()
  // Which company "automatic" means right now — the server answers it on the gather, the same way it will on create.
  const autoCompanyId = gather?.legalEntityId ?? space?.legalEntityId ?? mainCompany?.id ?? null
  const issuerPreview = useIssuerPreview(legalEntityId ?? autoCompanyId, currency)

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
    header,
    grouping,
    setGrouping,
    currencySource,
    setCurrencySource,
    legalEntityId,
    chooseCompany,
    autoCompanyId,
    issuerPreview,
    rate,
    setRate,
    entries,
    setEntry,
    dayRuns,
    setDayRuns,
    hourRuns,
    setHourRuns,
    groupByRole,
    setGroupByRole,
    lineStyle,
    setLineStyle,
    manualLines,
    setManualLines,
    org,
    entryRate,
    entryLabor,
    entryParts,
    siteMode,
    anyWorkRole,
    documentItems,
    subtotal,
    taxAmount,
    total,
    workSubtotal,
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

/** The draft as the new-invoice page holds it. */
export type NewInvoiceState = ReturnType<typeof useNewInvoice>
