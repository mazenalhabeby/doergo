"use client"

import { keys } from "@/lib/query-keys"
import { PlanGate } from "@/components/plan-gate"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { locationsApi, customersApi } from "@/lib/api"
import { useOrgLetterhead } from "@/hooks/use-org-letterhead"
import { useAuth } from "@/contexts/auth-context"
import type { LabourGrouping } from "@hbcfield/shared/client"
import {
  InvoiceTopBar, InvoiceNotice, InvoiceWorkbench, RailSection,
} from "../_components/invoice-shell"
import { InvoiceDocument, fmtDate } from "../_components/invoice-document"
import { LabourCostPanel } from "../_components/labour-cost-panel"
import { labourCostRows } from "../_lib/labour-cost-rows"
import {
  ClientFields, TermsFields, LineEditor, IssuedByField, type EditableLine,
} from "../_components/invoice-fields"
import { useCompanies, useIssuerPreview } from "@/components/companies/company-select"
import { useExchangeRate } from "../_lib/use-exchange-rate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PeriodValue } from "@/components/ui/period-picker"
import { todayIso, type DayRun, type HourRun, type WorkEntry } from "./_lib/draft-model"
import { useLineStyle } from "./_lib/use-line-style"
import { useApplyLines } from "./_lib/use-apply-lines"
import { useDraftLines } from "./_lib/use-draft-lines"
import { useCreateInvoice } from "./_lib/use-create-invoice"
import { useWorkGather } from "./_lib/use-work-gather"
import { HoursBasisChip } from "./_components/hours-basis-chip"
import { WorkSourceFields } from "./_components/work-source-fields"
import { LabourLayoutFields } from "./_components/labour-layout-fields"
import { AddToCrmOption } from "./_components/add-to-crm-option"
import { BillableWork } from "./_components/billable-work"

export default function NewInvoicePage() {
  return (
    <PlanGate feature="invoicing">
      <NewInvoiceInner />
    </PlanGate>
  )
}

function NewInvoiceInner() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const spaceIdFromUrl = params.get("spaceId") || undefined

  /*
    WHERE THE WORK COMES FROM — a choice, not a URL parameter.

    ⚠️ This screen could only ever bill a WORKSPACE, and only when something
    else had put `?spaceId=` in the address. Opening it from the Invoices page
    gave an empty form with no way to pull any work at all, and a company that
    bills a CLIENT whose jobs sit in three workspaces — or in none — could not
    produce that invoice here.

    Three sources, because all three are real: a workspace, a client, or nothing
    at all (a charge that was never a task).
  */
  const [source, setSource] = useState<"space" | "client" | "none">(spaceIdFromUrl ? "space" : "none")
  const [pickedSpaceId, setPickedSpaceId] = useState(spaceIdFromUrl ?? "")
  const [customerId, setCustomerId] = useState("")
  /** Type a client by hand, and offer to keep them. Only where there is a CRM. */
  const [addToCrm, setAddToCrm] = useState(false)
  /*
    HOW THE LABOUR IS WRITTEN UP — the customer's preference, not ours.

    A managing agent wants the jobs. A staffing client wants the hours. Somebody
    presenting to a board wants a figure with the detail underneath it. All
    three describe the same work for the same money, so this is a choice about
    the document rather than about the price.
  */
  const [grouping, setGrouping] = useState<LabourGrouping>("task")
  /*
    Which face of the document is showing.

    ⚠️ Defaults to the WORKING view, not the client's copy. Somebody arriving
    here is building, not proofing, and opening on a finished-looking letterhead
    invites them to hunt for the controls that made it.
  */
  const [view, setView] = useState<"build" | "client">("build")

  /*
    THE SERVICE PERIOD — which work this invoice is for.

    ⚠️ Without one the screen pulled EVERY unbilled job for the client, ever. A
    company that invoices monthly could not bill August separately from
    September, and the first invoice anybody raised swept up work they had not
    meant to bill yet — silently, because an invoice full of real jobs looks
    correct.

    Blank means "everything outstanding", which is the right answer for a
    one-off and was the only answer before.
  */
  // Last month by default — what an invoice raised on the 1st is nearly always for.
  const [periodValue, setPeriodValue] = useState<PeriodValue>({ mode: "last", from: "", to: "" })

  const spaceId = source === "space" ? pickedSpaceId || undefined : undefined

  /*
    IS THERE A CRM? Answered from the session, so it costs no request and cannot
    disagree with the navigation — and it needs no reload, because the answer
    arrives with the user.

    ⚠️ Absent and empty are different answers, exactly as the navbar has it: a
    session that predates `spaceModules` carries none at all, and reading that
    as "no workspace runs anything" would take the client picker away from
    people who had it a minute ago.
  */
  const hasCrm = user
    ? (user.spaceModules === undefined ? (user.orgModules ?? []) : user.spaceModules).includes("crm")
    : false

  const [clientName, setClientName] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [clientAddress, setClientAddress] = useState("")
  const [currency, setCurrency] = useState(user?.orgCurrency ?? "EUR")
  // Where the currency came from (workspace → client → organization); cleared once somebody picks one.
  const [currencySource, setCurrencySource] = useState<"workspace" | "client" | "company" | "organization" | null>(null)
  // The company that issues it. null = automatic: the workspace's → the client's → the main one.
  const [legalEntityId, setLegalEntityId] = useState<string | null>(null)
  const [issueDate, setIssueDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState("")
  const [taxPct, setTaxPct] = useState("20")
  const [discount, setDiscount] = useState("0")
  const [notes, setNotes] = useState("")
  const [rate, setRate] = useState("") // euros/hour applied to labor lines
  const [entries, setEntries] = useState<WorkEntry[]>([])
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
  const { data: spacePage } = useQuery({
    queryKey: keys.locations.list(),
    // ⚠️ Paginated: the payload is `{ data, meta }`, not an array. Reading it as
    // one silently yields nothing and an empty picker that looks like "no
    // workspaces exist".
    queryFn: () => locationsApi.list(),
    enabled: source === "space",
    staleTime: 5 * 60_000,
  })

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
  const billableSpaces = (spacePage?.data ?? []).filter(
    (sp) => sp.kind === "CUSTOMER" && sp.isActive !== false && !sp.isRemote,
  )

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
    source, spaceId, customerId, periodValue,
  })

  /**
   * The period, as the client reads it on the document.
   *
   * ⚠️ An invoice that says "37.5h — €1,500" without saying WHICH DAYS cannot be
   * checked against anything on the client's side, and the question comes back
   * as an email a week later. Where a period was chosen, the document states it.
   */
  const periodLabel = periodFrom && periodTo
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
  const entryParts = (e: WorkEntry) => (e.include && e.includeParts ? e.parts.reduce((s, p) => s + p.quantity * p.unitCost, 0) : 0)

  // A WORKSPACE invoice charges each person's time on site; a CLIENT invoice charges job hours.
  const siteMode = !!gather?.spaceId
  const {
    includedDays, includedHours, anyWorkRole, documentItems, workSubtotal, subtotal, taxAmount, total,
  } = useDraftLines({
    entries, dayRuns, hourRuns, manualLines, rateNum, grouping, groupByRole, lineStyle, siteMode,
    taxPct, discount, entryParts, t, language: i18n.language,
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
  const showMargin =
    canViewLabourCost &&
    gather?.twoRates === true &&
    costRows.some((r) => r.costCents != null)


  const createMutation = useCreateInvoice({
    t, router, queryClient, documentItems, spaceId, legalEntityId, source, customerId,
    clientName, clientEmail, clientAddress, currency, exchange, showLineTags: lineStyle.tags, taxPct, discount,
    issueDate, dueDate, periodFrom, periodTo, notes, addToCrm,
  })

  const includedCount = entries.filter((e) => e.include).length
  const canSave =
    clientName.trim().length > 0 &&
    exchange.valid &&
    (includedCount > 0 || includedDays.length > 0 || includedHours.length > 0 || manualLines.some((m) => m.description.trim()))

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
          {clientName.trim().length === 0
            ? t("invoices.create.needsClient")
            : t("invoices.create.needsLines")}
        </InvoiceNotice>
      )}

      <InvoiceWorkbench
        rail={
          <>
            {/* Where the work comes from */}
            <RailSection step={1} title={t("invoices.create.billFrom")}>
              <WorkSourceFields
                source={source} setSource={setSource} hasCrm={hasCrm}
                pickedSpaceId={pickedSpaceId} setPickedSpaceId={setPickedSpaceId} billableSpaces={billableSpaces}
                clientPage={clientPage} clients={clients} mayAddClient={mayAddClient}
                customerId={customerId} setCustomerId={setCustomerId} setAddToCrm={setAddToCrm}
                periodValue={periodValue} setPeriodValue={setPeriodValue} workDays={workDays}
              />
              <LabourLayoutFields
                entries={entries} grouping={grouping} setGrouping={setGrouping} siteMode={siteMode}
                anyWorkRole={anyWorkRole} groupByRole={groupByRole} setGroupByRole={setGroupByRole}
                lineStyle={lineStyle} setLineStyle={setLineStyle}
              />
            </RailSection>

            <RailSection step={2} title={t("invoices.create.clientSection")}>
              <ClientFields
                clientName={clientName} setClientName={setClientName}
                clientEmail={clientEmail} setClientEmail={setClientEmail}
                clientAddress={clientAddress} setClientAddress={setClientAddress}
                extra={
                  /*
                    Keep the client, when there is a CRM and a right to add to it.

                    ⚠️ VISIBLE BEFORE IT IS USABLE, and that is the fix. It first
                    appeared only once two characters had been typed, as muted
                    text the size of a footnote, and did nothing until Save — so
                    somebody filling in a client by hand had no way to know the
                    option existed at all, which is exactly how it was reported.

                    ⚠️ ONLY when the lines are being entered by hand, because
                    that is the only case where the client is genuinely new to
                    us. Picked FROM the CRM it is already there; gathered from a
                    WORKSPACE that customer already exists as a workspace, and
                    adding it again makes a second version of one relationship.

                    And never without `crmCaps` — the server's own answer about
                    who may create a client — so the offer cannot appear to
                    somebody it would then refuse.
                  */
                  hasCrm && mayAddClient && source === "none" ? (
                    <AddToCrmOption clientName={clientName} addToCrm={addToCrm} setAddToCrm={setAddToCrm} />
                  ) : null
                }
              />
            </RailSection>

            {/*
              ⚠️ DATES, CURRENCY AND TAX ARE NOT "WHO IT IS FOR".

              They sat in that card because the old full-width layout had room
              for a second column and something had to fill it. In a rail that
              produced "Rate (per hour)" wrapped over three lines beside a
              currency box reading "EUF" — but the labels were only the symptom.
              A section called "who it is for" that also sets the hourly rate is
              a section somebody has to read twice to use once.
            */}
            <RailSection step={3} title={t("invoices.create.termsSection")}>
              <TermsFields
                issueDate={issueDate} setIssueDate={setIssueDate}
                dueDate={dueDate} setDueDate={setDueDate}
                currency={currency}
                setCurrency={(c) => { setCurrency(c); setCurrencySource(null) }}
                currencySource={currencySource}
                exchange={exchange}
                taxPct={taxPct} setTaxPct={setTaxPct}
                discount={discount} setDiscount={setDiscount}
              >
                <IssuedByField value={legalEntityId} onChange={chooseCompany} autoId={autoCompanyId} />
                {/*
                  The fallback hourly rate — this screen's own term, because
                  only this one derives lines from recorded hours. The edit
                  screen corrects lines that already carry their rate, so it
                  has nothing to apply a fallback to.
                */}
                <div>
                  <Label className="text-xs">{t("invoices.create.rate")}</Label>
                  <Input
                    type="number" min={0} step="0.01" value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="mt-1 h-9 tabular-nums"
                    placeholder={t("invoices.create.ratePlaceholder")}
                  />
                  {/* Says what it is FOR. A bare "Rate" in an invoice form is
                      ambiguous with every other rate on the page. */}
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("invoices.create.rateHint")}</p>
                </div>
              </TermsFields>
            </RailSection>
          </>
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
                return <HoursBasisChip basis={row.hoursBasis} hoursByBasis={h?.hoursByBasis} spaceId={gather?.spaceId} assignmentId={h?.assignmentId} />
              }}
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
            entries={entries} dayRuns={dayRuns} hourRuns={hourRuns}
            setDayRuns={setDayRuns} setHourRuns={setHourRuns} setEntry={setEntry}
            expanded={expanded} setExpanded={setExpanded}
            gatherLoading={gatherLoading} includedCount={includedCount} currency={currency}
            entryRate={entryRate} entryLabor={entryLabor} entryParts={entryParts}
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
