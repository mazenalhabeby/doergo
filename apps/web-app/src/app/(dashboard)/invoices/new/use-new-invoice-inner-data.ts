"use client"

import { keys } from "@/lib/query-keys"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { locationsApi, customersApi } from "@/lib/api"
import { useOrgLetterhead } from "@/hooks/use-org-letterhead"
import { fmtDate } from "../_components/invoice-document"
import { type EditableLine } from "../_components/invoice-fields"
import { useCompanies, useIssuerPreview } from "@/components/companies/company-select"
import { type DayRun, type HourRun } from "./_lib/draft-model"
import { useLineStyle } from "./_lib/use-line-style"
import { useApplyLines } from "./_lib/use-apply-lines"
import { useWorkGather } from "./_lib/use-work-gather"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { useNewInvoiceInnerSource } from "./use-new-invoice-inner-source"

/** useNewInvoiceInner's state and handlers — everything before its markup, moved here unchanged. */
export function useNewInvoiceInnerData() {
  const {
    t,
    i18n,
    router,
    queryClient,
    user,
    source,
    setSource,
    pickedSpaceId,
    setPickedSpaceId,
    customerId,
    setCustomerId,
    addToCrm,
    setAddToCrm,
    grouping,
    setGrouping,
    view,
    setView,
    periodValue,
    setPeriodValue,
    spaceId,
    hasCrm,
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
    currencySource,
    setCurrencySource,
    legalEntityId,
    setLegalEntityId,
    rate,
    setRate,
    entries,
    setEntries,
  } = useNewInvoiceInnerSource()

  const [dayRuns, setDayRuns] = useState<DayRun[]>([])
  const [hourRuns, setHourRuns] = useState<HourRun[]>([])
  // On by default: where people have trades, the client reads the work by trade.
  const [groupByRole, setGroupByRole] = useState(true)
  // How much a labour line's description says — remembered for the next invoice.
  const { lineStyle, setLineStyle } = useLineStyle()
  const [manualLines, setManualLines] = useState<EditableLine[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
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

  /** The workspaces to choose from, only once somebody is choosing one. */
  const { data: activeSpaces = [] } = useActiveSpaces({ enabled: source === "space" })

  /*
    ⚠️ ONLY THE WORKSPACES THAT ARE CUSTOMERS.

    A workspace is one of three things — a project, your own company, or a
    customer you do work for — and only the last can be sent a bill. Offering
    the warehouse and the head office invited somebody to invoice their own
    depot, and the schema already says so: `contactName`, `contactEmail` and the
    per-space billable rate all exist on the CUSTOMER kind alone.
    
    The product agrees everywhere else: the Invoices tab on a workspace only
    appears when `kind === "CUSTOMER"`. This picker was the one place that did
    not. Archived spaces and the Remote bucket are out for the usual reasons —
    one is finished, the other is not a place.
  */
  const billableSpaces = activeSpaces.filter((sp) => sp.kind === "CUSTOMER" && sp.isActive !== false && !sp.isRemote)

  /*
    The client list, and — from the same response — whether this person may
    CREATE one. `crmCaps` is the server's own answer, so the "also add them"
    offer cannot appear for somebody the server would refuse.
  */
  const { data: clientPage } = useQuery({
    queryKey: keys.customers.list({ limit: 200, contacts: "exclude", status: "active" }),
    queryFn: () => customersApi.list({ limit: 200, contacts: "exclude", status: "active" }),
    enabled: hasCrm,
    staleTime: 60_000,
  })
  const clients = clientPage?.data ?? []
  const mayAddClient = clientPage?.meta?.crmCaps?.manage === true || clientPage?.meta?.crmCaps?.editInfo === true

  const { gatherSource, gather, gatherLoading, workDays, periodFrom, periodTo } = useWorkGather({
    source,
    spaceId,
    customerId,
    periodValue,
  })

  /**
   * The period, as the client reads it on the document.
   *
   * ⚠️ An invoice that says "37.5h — €1,500" without saying WHICH DAYS cannot be
   * checked against anything on the client's side, and the question comes back
   * as an email a week later. Where a period was chosen, the document states it.
   */
  const periodLabel =
    periodFrom && periodTo
      ? `${fmtDate(periodFrom)} – ${fmtDate(periodTo)}`
      : periodFrom
        ? t("invoices.create.periodFromOnly", { from: fmtDate(periodFrom) })
        : periodTo
          ? t("invoices.create.periodToOnly", { to: fmtDate(periodTo) })
          : ""

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

  return {
    t,
    i18n,
    router,
    queryClient,
    user,
    source,
    setSource,
    pickedSpaceId,
    setPickedSpaceId,
    customerId,
    setCustomerId,
    addToCrm,
    setAddToCrm,
    grouping,
    setGrouping,
    view,
    setView,
    periodValue,
    setPeriodValue,
    spaceId,
    hasCrm,
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
    currencySource,
    setCurrencySource,
    legalEntityId,
    setLegalEntityId,
    rate,
    setRate,
    entries,
    setEntries,
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
    expanded,
    setExpanded,
    seeded,
    setSeeded,
    linesFrom,
    applyLines,
    org,
    billableSpaces,
    clientPage,
    clients,
    mayAddClient,
    gatherSource,
    gather,
    gatherLoading,
    workDays,
    periodFrom,
    periodTo,
    periodLabel,
    companies,
    autoCompanyId,
    issuerPreview,
  }
}
