"use client"

import { PlanGate } from "@/components/plan-gate"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Plus, Trash2, Loader2, Clock, Package, FileText, ChevronDown, ChevronRight } from "lucide-react"

import { invoicesApi, locationsApi, customersApi, organizationsApi, type Invoice, type InvoiceItemInput } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { buildLabourLines, labourTotalCents, type LabourGrouping, type LabourEntry } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import {
  InvoiceTopBar, InvoiceNotice, InvoiceWorkbench, RailSection,
} from "../_components/invoice-shell"
import { InvoiceDocument, money, fmtDate, type DocumentView } from "../_components/invoice-document"
import {
  ClientFields, TermsFields, LineEditor, num, type EditableLine,
} from "../_components/invoice-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/date-picker"
import { Skeleton } from "@/components/ui/skeleton"

interface PartEntry { name: string; partNumber?: string | null; quantity: number; unitCost: number }
interface WorkEntry {
  /*
    ⚠️ The rate for THIS person, not one rate for the job. A single job rate is
    wrong the moment two people with different rates work the same site — which
    is the normal case for anyone billing labour at all. `rate` below survives
    as the fallback for entries the ladder could not answer for.
  */
  billRateCents: number | null
  costRateCents: number | null
  taskId: string
  taskTitle: string
  reportId?: string | null
  workerName?: string | null
  hours: number
  notes?: string | null
  completedAt?: string | null
  parts: PartEntry[]
  hasReport: boolean
  include: boolean
  includeParts: boolean
}
/**
 * A Date → `YYYY-MM-DD`, from the LOCAL parts.
 *
 * ⚠️ Not `toISOString().slice(0,10)`. That converts to UTC first, so east of
 * Greenwich the 1st of a month becomes the 31st of the one before — and a
 * period preset called "last month" would quietly start a day early, on a
 * screen whose entire job is to say which days are being charged for.
 */
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function todayIso() { return isoOf(new Date()) }

/** The first and last day of a whole month, `shift` months from now. */
function monthBounds(shift: number): [string, string] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + shift, 1)
  // Day 0 of the NEXT month is the last day of this one — which gets February
  // and the 31st right without a table of month lengths.
  const last = new Date(now.getFullYear(), now.getMonth() + shift + 1, 0)
  return [isoOf(first), isoOf(last)]
}

/** Is the chosen range exactly this preset? Decides which chip reads as active. */
function isPreset(key: "lastMonth" | "thisMonth" | "all", from: string, to: string): boolean {
  if (key === "all") return !from && !to
  const [f, t] = monthBounds(key === "lastMonth" ? -1 : 0)
  return from === f && to === t
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** "Sarah Wagner" → "SW", for the avatar beside a gathered job. */
function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"
}

export default function NewInvoicePage() {
  return (
    <PlanGate feature="invoicing">
      <NewInvoiceInner />
    </PlanGate>
  )
}

function NewInvoiceInner() {
  const { t } = useTranslation()
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
  const [periodFrom, setPeriodFrom] = useState("")
  const [periodTo, setPeriodTo] = useState("")

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
  const [currency, setCurrency] = useState("EUR")
  const [issueDate, setIssueDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState("")
  const [taxPct, setTaxPct] = useState("20")
  const [discount, setDiscount] = useState("0")
  const [notes, setNotes] = useState("")
  const [rate, setRate] = useState("") // euros/hour applied to labor lines
  const [entries, setEntries] = useState<WorkEntry[]>([])
  const [manualLines, setManualLines] = useState<EditableLine[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [seeded, setSeeded] = useState(false)

  // Space (for the client header + fallback prefill).
  const { data: space } = useQuery({
    queryKey: ["location", spaceId],
    queryFn: () => locationsApi.getById(spaceId!),
    enabled: !!spaceId,
  })

  /*
    The letterhead — this organisation's own details, for the client's copy.

    Cheap and shared: the same query key the rest of the app uses, so opening
    this screen costs no extra request on a warm cache.
  */
  const { data: org } = useQuery({
    queryKey: ["org-profile"],
    queryFn: () => organizationsApi.getProfile(),
    staleTime: 5 * 60_000,
  })

  /** The workspaces to choose from, only once somebody is choosing one. */
  const { data: spacePage } = useQuery({
    queryKey: ["locations", "for-invoice"],
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
    queryKey: ["customers", "for-invoice"],
    queryFn: () => customersApi.list({ limit: 200, contacts: "exclude", status: "active" }),
    enabled: hasCrm,
    staleTime: 60_000,
  })
  const clients = clientPage?.data ?? []
  const mayAddClient = clientPage?.meta?.crmCaps?.manage === true || clientPage?.meta?.crmCaps?.editInfo === true

  // Completed, unbilled work — from whichever end was chosen, over whichever
  // days were named. Both ends are optional: blank means everything still
  // outstanding, which is right for a one-off job.
  const period = { from: periodFrom || undefined, to: periodTo || undefined }

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
  const gatherSource = source === "space" && spaceId
    ? { spaceId, ...period }
    : source === "client" && customerId
      ? { customerId, ...period }
      : null
  const { data: gather, isLoading: gatherLoading } = useQuery({
    queryKey: ["invoice-gather", gatherSource],
    queryFn: () => invoicesApi.gather(gatherSource!),
    enabled: !!gatherSource,
  })

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
      if (g.currency) setCurrency(g.currency)
      if (g.rate != null) setRate(String(g.rate))
      setEntries(
        (g.workEntries || []).map((w) => ({
          taskId: w.taskId,
          taskTitle: w.taskTitle,
          reportId: w.reportId,
          workerName: w.workerName,
          hours: w.hours ?? 0,
          billRateCents: (w as { billRateCents?: number | null }).billRateCents ?? null,
          costRateCents: (w as { costRateCents?: number | null }).costRateCents ?? null,
          notes: w.notes,
          completedAt: w.completedAt,
          parts: w.parts || [],
          hasReport: w.hasReport,
          include: true,
          includeParts: true,
        })),
      )
      setSeeded(true)
    }
  }, [gather, seeded])

  const rateNum = Number(rate) || 0

  const setEntry = (taskId: string, patch: Partial<WorkEntry>) =>
    setEntries((prev) => prev.map((e) => (e.taskId === taskId ? { ...e, ...patch } : e)))

  /** This entry's own hourly rate in euros, or the form's fallback. */
  const entryRate = (e: WorkEntry) => (e.billRateCents != null ? e.billRateCents / 100 : rateNum)
  const entryLabor = (e: WorkEntry) => (e.include ? e.hours * entryRate(e) : 0)
  const entryCost = (e: WorkEntry) =>
    e.include && e.costRateCents != null ? e.hours * (e.costRateCents / 100) : 0
  const entryParts = (e: WorkEntry) => (e.include && e.includeParts ? e.parts.reduce((s, p) => s + p.quantity * p.unitCost, 0) : 0)

  /*
    ⚠️ ONE CALCULATION, SHOWN AND SENT.

    The screen used to total the work with its own loop while the mutation built
    the lines with another — so choosing a grouping changed what was SENT and
    nothing on screen moved, which is exactly how it was reported. Two
    arithmetics over one invoice is also how a displayed total quietly stops
    matching the document it produced.

    So the lines are built once, here, by the shared rule; the preview renders
    them and the mutation sends them.
  */
  const labourEntries = useMemo<LabourEntry[]>(
    () =>
      entries
        .filter((e) => e.include)
        .map((e) => ({
          taskId: e.taskId,
          taskTitle: e.taskTitle,
          reportId: e.reportId ?? null,
          workerName: e.workerName ?? null,
          hours: e.hours,
          // The form's fallback rate applies where the ladder had no answer.
          billRateCents: e.billRateCents ?? (rateNum > 0 ? Math.round(rateNum * 100) : null),
          costRateCents: e.costRateCents ?? null,
        })),
    [entries, rateNum],
  )

  const labourLines = useMemo(
    () => buildLabourLines(labourEntries, grouping, t("invoices.create.unassignedWorker")),
    [labourEntries, grouping, t],
  )

  const labourSubtotal = useMemo(() => labourTotalCents(labourLines) / 100, [labourLines])

  /*
    THE DOCUMENT — every line, in order, exactly as it will be filed.

    ⚠️ One list, rendered AND sent. The sheet below is not a picture of the
    invoice; it is the invoice, and the mutation maps straight off this. A
    preview built separately from the payload is a preview that eventually lies,
    and the lie is only found by a customer holding both.
  */
  const documentItems = useMemo(() => {
    const rows: Array<InvoiceItemInput & { descriptive?: boolean }> = []

    for (const line of labourLines) {
      rows.push({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPriceCents / 100,
        taskId: line.taskId || undefined,
        reportId: line.reportId || undefined,
        billRateCents: line.billRateCents,
        costRateCents: line.costRateCents,
        billedHours: line.billedHours,
        descriptive: line.descriptive,
      })
    }
    for (const e of entries) {
      if (!e.include || !e.includeParts) continue
      for (const part of e.parts) {
        rows.push({
          description: part.partNumber ? `${part.name} (${part.partNumber})` : part.name,
          quantity: part.quantity,
          unitPrice: part.unitCost,
          taskId: e.taskId,
          reportId: e.reportId || undefined,
        })
      }
    }
    for (const m of manualLines) {
      if (!m.description.trim()) continue
      rows.push({
        description: m.description.trim(),
        // ⚠️ `num`, not `Number`. A half-typed "3," is NaN to `Number` and would
        // put NaN on the document; the shared parser also accepts a comma
        // decimal, which is what most of Europe types.
        quantity: num(m.quantity),
        unitPrice: num(m.unitPrice),
      })
    }
    return rows
  }, [labourLines, entries, manualLines])
  const partsSubtotal = useMemo(() => entries.reduce((s, e) => s + entryParts(e), 0), [entries])
  const workSubtotal = labourSubtotal + partsSubtotal
  const manualSubtotal = useMemo(
    () => manualLines.reduce((s, m) => s + num(m.quantity) * num(m.unitPrice), 0),
    [manualLines],
  )
  const subtotal = workSubtotal + manualSubtotal
  const taxAmount = subtotal * ((Number(taxPct) || 0) / 100)
  const total = subtotal + taxAmount - (Number(discount) || 0)

  // Live per-worker hours summary from the included entries.
  const workerSummary = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      if (!e.include || !e.workerName || e.hours <= 0) continue
      map.set(e.workerName, Math.round(((map.get(e.workerName) || 0) + e.hours) * 100) / 100)
    }
    return Array.from(map.entries()).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours)
  }, [entries])
  const totalHours = workerSummary.reduce((s, w) => s + w.hours, 0)

  /*
    Cost only ever comes from entries the SERVER resolved — never re-derived
    here. A browser that computed a margin from rates it happened to hold would
    be a second answer to the question the boundary exists to control.
  */
  const workCost = useMemo(() => entries.reduce((s, e) => s + entryCost(e), 0), [entries])
  const canViewLabourCost = (user as { canViewLabourCost?: boolean } | null)?.canViewLabourCost === true
  const showMargin = canViewLabourCost && gather?.twoRates === true && entries.some((e) => e.include && e.costRateCents != null)


  const createMutation = useMutation({
    mutationFn: () => {
      const items: InvoiceItemInput[] = []

      /*
        ⚠️ THE VERY LINES THE PREVIEW RENDERED. Not rebuilt here — rebuilt is
        how the screen and the document drift apart, and the drift is invisible
        until a customer compares them.
      */
      /*
        ⚠️ Mapped off `documentItems`, the very list the sheet rendered — not
        rebuilt. Rebuilt is how a preview and a document drift apart, and the
        drift is invisible until a customer is holding both.
      */
      for (const row of documentItems) {
        const { descriptive: _omit, ...item } = row
        void _omit
        items.push(item)
      }
      return invoicesApi.create({
        spaceId,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        currency,
        taxRate: (Number(taxPct) || 0) / 100,
        discount: Number(discount) || 0,
        issueDate,
        dueDate: dueDate || undefined,
        // Kept on the invoice so it can still say which days it covers long
        // after the gather that built it would return something different.
        servicePeriodFrom: periodFrom || undefined,
        servicePeriodTo: periodTo || undefined,
        notes: notes.trim() || undefined,
        items,
      })
    },
    onSuccess: async (inv: Invoice) => {
      notify.success(t("invoices.create.created"))
      queryClient.invalidateQueries({ queryKey: ["invoices"] })

      /*
        Keep the client, if they asked — AFTER the invoice exists, and never
        instead of it.

        ⚠️ A failure here must not cost them the invoice. Adding to the CRM is a
        convenience on top of the thing they came to do; wrapping the two in one
        promise would let a duplicate-name refusal throw away a finished
        invoice. So it is awaited, reported quietly, and moved past either way.
      */
      if (addToCrm && clientName.trim()) {
        try {
          await customersApi.create({
            name: clientName.trim(),
            email: clientEmail.trim() || undefined,
            address: clientAddress.trim() || undefined,
          })
          queryClient.invalidateQueries({ queryKey: ["customers"] })
          notify.success(t("invoices.create.clientAdded"))
        } catch {
          notify.error(t("invoices.create.clientAddFailed"))
        }
      }

      router.push(`/invoices/${inv.id}`)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const includedCount = entries.filter((e) => e.include).length
  const canSave = clientName.trim().length > 0 && (includedCount > 0 || manualLines.some((m) => m.description.trim()))

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
        onBack={() => router.back()}
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
              {/*
            ⚠️ STACKED, not wrapped. Three options of very different lengths in
            a flex-wrap put two on one row and the third alone underneath —
            which reads as two choices and an afterthought rather than as one
            choice of three. A column gives them equal weight and equal width.
          */}
          <div className="grid gap-1 rounded-xl border border-border bg-muted/50 p-1">
                {([
                  ["space", t("invoices.create.fromSpace")],
                  ...(hasCrm ? [["client", t("invoices.create.fromClient")] as const] : []),
                  ["none", t("invoices.create.fromNothing")],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSource(key as typeof source)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      source === key
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        : "border-border text-muted-foreground hover:border-slate-400",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {source === "space" && (
                <div className="mt-3">
                  <Label className="text-xs">{t("invoices.create.workspace")}</Label>
                  {/*
                    ⚠️ A COMBOBOX, not a <select>. A native select is a scroll
                    with no search — fine for three customer workspaces, useless
                    at thirty, and there is no moment where anybody notices it
                    became useless. It just gets slower every time a customer is
                    added.

                    The app already had this component, searchable and
                    result-capped; a second picker here would have been a second
                    set of keyboard behaviour to get right and keep right.
                  */}
                  <Combobox
                    value={pickedSpaceId}
                    onChange={setPickedSpaceId}
                    options={billableSpaces.map((sp) => ({
                      value: sp.id,
                      label: sp.name,
                      // Searchable by address and contact too: people know a
                      // site by where it is as often as by what it is called.
                      keywords: [sp.address, sp.contactName].filter(Boolean).join(" "),
                    }))}
                    placeholder={t("invoices.create.choose")}
                    searchPlaceholder={t("invoices.create.searchWorkspace")}
                    className="mt-1"
                  />
                  {billableSpaces.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">{t("invoices.create.noCustomerSpaces")}</p>
                  )}
                </div>
              )}

              {source === "client" && (
                <div className="mt-3">
                  <Label className="text-xs">{t("invoices.create.client")}</Label>
                  {/*
                    ⚠️ This is the list that gets long. A real book of clients
                    runs to hundreds and the query caps at 200 — so without a
                    search box the two hundredth client is unreachable by
                    anything except scrolling, and nobody ever notices the
                    moment a native <select> stopped being usable. It just gets
                    slower every time a customer is added.

                    Matched on email and address as well as name: somebody
                    looking for a client they invoiced last year remembers the
                    town far more often than the exact registered name.
                  */}
                  <Combobox
                    value={customerId}
                    onChange={setCustomerId}
                    options={clients.map((c) => ({
                      value: c.id,
                      label: c.name,
                      keywords: [c.email, c.address, c.phone].filter(Boolean).join(" "),
                    }))}
                    placeholder={t("invoices.create.choose")}
                    searchPlaceholder={t("invoices.create.searchClient")}
                    className="mt-1"
                  />
                  {/*
                    The client's details fill the header below, and stay editable —
                    an invoice sometimes goes to a different address than the one on
                    the record, and refusing that would send people back to the CRM
                    to edit a client in order to send one invoice.
                  */}
                  <p className="mt-1 text-xs text-muted-foreground">{t("invoices.create.clientFillsHeader")}</p>
                </div>
              )}

              {source === "none" && (
                <p className="mt-3 text-xs text-muted-foreground">{t("invoices.create.nothingHint")}</p>
              )}

              {/*
                WHICH WORK — the service period.

                ⚠️ Presets first, because the answer is nearly always "last
                month". Somebody invoicing on the 1st should not have to reason
                about two dates to say the obvious thing, and a pair of empty
                calendars gives no clue a period was even expected.

                Blank stays legitimate: "everything outstanding" is right for a
                one-off, and is what this screen did before a period existed.
              */}
              {source !== "none" && (
                <div className="mt-4 border-t border-border pt-3">
                  <Label className="text-xs">{t("invoices.create.period")}</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {([
                      ["lastMonth", t("invoices.create.periodLastMonth")],
                      ["thisMonth", t("invoices.create.periodThisMonth")],
                      ["all", t("invoices.create.periodAll")],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (key === "all") { setPeriodFrom(""); setPeriodTo(""); return }
                          const [from, to] = monthBounds(key === "lastMonth" ? -1 : 0)
                          setPeriodFrom(from)
                          setPeriodTo(to)
                        }}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                          isPreset(key, periodFrom, periodTo)
                            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            : "border-border text-muted-foreground hover:border-slate-400",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2 space-y-2">
                    <DatePicker
                      value={periodFrom}
                      onChange={setPeriodFrom}
                      placeholder={t("invoices.create.periodFrom")}
                      clearable
                    />
                    <DatePicker
                      value={periodTo}
                      onChange={setPeriodTo}
                      placeholder={t("invoices.create.periodTo")}
                      clearable
                      fromDate={periodFrom ? new Date(periodFrom) : undefined}
                    />
                  </div>

                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {periodFrom || periodTo
                      ? t("invoices.create.periodHint")
                      : t("invoices.create.periodAllHint")}
                  </p>
                </div>
              )}

              {/*
                How the labour is written up — shown only once there is labour.

                ⚠️ All three price the same work identically where the hours are
                clean, so this is a choice about the DOCUMENT and never about the
                amount. Offering it before any work has been gathered would be a
                control with nothing to act on.
              */}
              {entries.some((e) => e.include && e.hours > 0) && (
                <div className="mt-4 border-t border-border pt-3">
                  <Label className="text-xs">{t("invoices.create.groupBy")}</Label>
                  <div className="mt-2 grid gap-1 rounded-xl border border-border bg-muted/50 p-1">
                    {([
                      ["task", t("invoices.create.groupByTask")],
                      ["member", t("invoices.create.groupByMember")],
                      ["both", t("invoices.create.groupByBoth")],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setGrouping(key as LabourGrouping)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                          grouping === key
                            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            : "border-border text-muted-foreground hover:border-slate-400",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {grouping === "task"
                      ? t("invoices.create.groupByTaskHint")
                      : grouping === "member"
                        ? t("invoices.create.groupByMemberHint")
                        : t("invoices.create.groupByBothHint")}
                  </p>
                </div>
              )}
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
                    <label
                      className={cn(
                        "mt-2 flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                        clientName.trim().length > 1
                          ? "cursor-pointer border-border hover:border-slate-400"
                          : "border-dashed border-border opacity-60",
                      )}
                    >
                      <Checkbox
                        className="mt-0.5"
                        disabled={clientName.trim().length <= 1}
                        checked={addToCrm}
                        onCheckedChange={(v) => setAddToCrm(v === true)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-foreground">{t("invoices.create.alsoAddClient")}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {clientName.trim().length > 1
                            ? t("invoices.create.alsoAddClientWhen", { name: clientName.trim() })
                            : t("invoices.create.alsoAddClientNeedsName")}
                        </span>
                      </span>
                    </label>
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
                currency={currency} setCurrency={setCurrency}
                taxPct={taxPct} setTaxPct={setTaxPct}
                discount={discount} setDiscount={setDiscount}
              >
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
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-sm font-medium text-foreground mb-3">{t("invoices.create.marginTitle")}</p>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("invoices.create.billed")}</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{money(workSubtotal, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("invoices.create.labourCost")}</p>
                <p className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-500">{money(workCost, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("invoices.create.margin")}</p>
                <p className={cn(
                  "text-lg font-semibold tabular-nums",
                  workSubtotal - workCost < 0 ? "text-red-600 dark:text-red-400" : "text-teal-700 dark:text-teal-400",
                )}>
                  {money(workSubtotal - workCost, currency)}
                </p>
              </div>
            </div>
            {/* Billing under cost is a real thing — a fixed price, a goodwill
                rate — and hiding it is how somebody finds out at quarter end. */}
            <p className="mt-2 text-[11px] text-muted-foreground">{t("invoices.create.marginHint")}</p>
          </div>
        )}

        {/* Billable work (system-sourced) */}
        {spaceId && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="flex items-center gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">4</span>
                <span className="text-sm font-semibold text-foreground">{t("invoices.create.billableWork")}</span>
              </span>
              <span className="text-xs text-muted-foreground">{t("invoices.create.jobsSelected", { count: includedCount, total: entries.length })}</span>
            </div>

            {gatherLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
            ) : entries.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border text-center py-12">
                <FileText className="size-10 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">{t("invoices.create.noWork")}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{t("invoices.create.noWorkHint")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {entries.map((e) => {
                  const open = expanded[e.taskId]
                  const lineTotal = entryLabor(e) + entryParts(e)
                  return (
                    <div key={e.taskId} className={cn("bg-card rounded-xl border transition-colors", e.include ? "border-border" : "border-border/40 opacity-60")}>
                      <div className="flex items-start gap-3 p-4">
                        <Checkbox checked={e.include} onCheckedChange={(v) => setEntry(e.taskId, { include: !!v })} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-foreground truncate">{e.taskTitle}</p>
                            <span className="text-sm font-semibold tabular-nums shrink-0">{money(lineTotal, currency)}</span>
                          </div>
                          {/* worker · hours · date chips */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <span className="size-5 rounded-full bg-brand-600/15 text-brand-700 dark:text-brand-300 text-[9px] font-semibold flex items-center justify-center">{initials(e.workerName)}</span>
                              {e.workerName || t("invoices.create.unassignedWorker")}
                            </span>
                            <span className="inline-flex items-center gap-1"><Clock className="size-3" />
                              <input
                                type="number" min={0} step="0.25" value={e.hours}
                                onChange={(ev) => setEntry(e.taskId, { hours: Number(ev.target.value) })}
                                className="w-14 bg-transparent border-b border-dashed border-border focus:border-brand-600 outline-none text-xs tabular-nums text-foreground"
                              /> h × {money(rateNum, currency)}
                            </span>
                            <span>{fmtDate(e.completedAt)}</span>
                            {e.parts.length > 0 && <span className="inline-flex items-center gap-1"><Package className="size-3" /> {t("invoices.create.partsCount", { count: e.parts.length })}</span>}
                          </div>
                          {/* notes preview */}
                          {e.notes && <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">{e.notes}</p>}
                          {/* expand for parts / full notes */}
                          {(e.parts.length > 0 || (e.notes && e.notes.length > 120)) && (
                            <button onClick={() => setExpanded((p) => ({ ...p, [e.taskId]: !open }))} className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline">
                              {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                              {open ? t("invoices.create.hideDetails") : t("invoices.create.showDetails")}
                            </button>
                          )}
                          {open && (
                            <div className="mt-2 space-y-2">
                              {e.notes && <p className="text-xs text-muted-foreground whitespace-pre-line rounded-lg bg-muted/40 p-2.5">{e.notes}</p>}
                              {e.parts.length > 0 && (
                                <div className="rounded-lg border border-border/60 overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30">
                                    <span className="text-[11px] font-medium text-muted-foreground">{t("invoices.create.parts")}</span>
                                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                                      <Checkbox checked={e.includeParts} onCheckedChange={(v) => setEntry(e.taskId, { includeParts: !!v })} className="size-3.5" />
                                      {t("invoices.create.billParts")}
                                    </label>
                                  </div>
                                  {e.parts.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs border-t border-border/40">
                                      <span className="text-foreground">{p.name}{p.partNumber ? ` (${p.partNumber})` : ""}</span>
                                      <span className="text-muted-foreground tabular-nums">{p.quantity} × {money(p.unitCost, currency)} = {money(p.quantity * p.unitCost, currency)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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
