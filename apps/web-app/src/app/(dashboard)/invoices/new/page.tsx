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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"
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
interface ManualLine { description: string; quantity: number; unitPrice: number }

function todayIso() { return new Date().toISOString().slice(0, 10) }

/**
 * A section's heading.
 *
 * ⚠️ The page was nine identically-weighted cards, which is the whole of why it
 * read as old: with everything shouting equally there is no spine, and a person
 * has to read each block to find out what it is. A numbered eyebrow costs one
 * line and gives the eye somewhere to land.
 */
function SectionHead({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-none text-foreground">{title}</h2>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}
const round2 = (n: number) => Math.round(n * 100) / 100
function money(n: number, currency: string) {
  try { return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency || "EUR" }).format(n || 0) }
  catch { return `${(n || 0).toFixed(2)} ${currency}` }
}
function fmtDate(d?: string | null) {
  if (!d) return "—"
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}
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
  const [manualLines, setManualLines] = useState<ManualLine[]>([])
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

  // Completed, unbilled work — from whichever end was chosen.
  const gatherSource = source === "space" && spaceId
    ? { spaceId }
    : source === "client" && customerId
      ? { customerId }
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
        quantity: Number(m.quantity) || 0,
        unitPrice: Number(m.unitPrice) || 0,
      })
    }
    return rows
  }, [labourLines, entries, manualLines])
  const partsSubtotal = useMemo(() => entries.reduce((s, e) => s + entryParts(e), 0), [entries])
  const workSubtotal = labourSubtotal + partsSubtotal
  const manualSubtotal = useMemo(
    () => manualLines.reduce((s, m) => s + (Number(m.quantity) || 0) * (Number(m.unitPrice) || 0), 0),
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

  const addManual = () => setManualLines((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }])
  const setManual = (i: number, patch: Partial<ManualLine>) => setManualLines((p) => p.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  const removeManual = (i: number) => setManualLines((p) => p.filter((_, idx) => idx !== i))

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
      {/* ── The bar: the way out, what it is, and the way to commit ────── */}
      <div className="sticky top-0 z-30 flex items-center gap-3.5 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur-md sm:px-5">
        <Button variant="outline" size="icon" className="size-[30px] shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground">
            {t("invoices.create.title")}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {clientName.trim() || t("invoices.create.noClientYet")}
          </p>
        </div>
        <span className="flex-1" />
        <span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 sm:inline">
          {t("invoices.status.draft", "Draft")}
        </span>
        <Button
          className="shrink-0"
          disabled={!canSave || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
          {t("invoices.create.saveDraft")}
        </Button>
      </div>

      {/*
        ⚠️ SAYS WHY SAVE IS OFF, rather than only greying it. A disabled action
        with no reason beside it is the commonest way a form wastes somebody's
        afternoon — and on this page the missing thing is usually one field in a
        rail they have already scrolled past.
      */}
      {!canSave && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 sm:px-5">
          {clientName.trim().length === 0
            ? t("invoices.create.needsClient")
            : t("invoices.create.needsLines")}
        </div>
      )}

      <div className="grid items-start lg:grid-cols-[320px_minmax(0,1fr)]">
        {/*
          THE TOOL. Settings live here and stay put; the document never moves
          while somebody changes them — which is the other half of what was
          wrong, since the controls used to sit ABOVE the thing they change.
        */}
        <aside className="border-b border-border bg-muted/30 px-4 py-5 lg:sticky lg:top-[53px] lg:h-[calc(100dvh-53px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="space-y-5 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-5">
            {/* Where the work comes from */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <SectionHead step={1} title={t("invoices.create.billFrom")} />
              <div className="flex flex-wrap gap-2">
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
                How the labour is written up — shown only once there is labour.

                ⚠️ All three price the same work identically where the hours are
                clean, so this is a choice about the DOCUMENT and never about the
                amount. Offering it before any work has been gathered would be a
                control with nothing to act on.
              */}
              {entries.some((e) => e.include && e.hours > 0) && (
                <div className="mt-4 border-t border-border pt-3">
                  <Label className="text-xs">{t("invoices.create.groupBy")}</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
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
            </div>

            {/* Client + meta */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <SectionHead step={2} title={t("invoices.create.clientSection")} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">{t("invoices.create.clientName")} *</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="h-9 mt-1" />
                  {/*
                    Keep the client, when there is a CRM and a right to add to it.

                    ⚠️ VISIBLE BEFORE IT IS USABLE, and that is the fix. It first
                    appeared only once two characters had been typed, as muted text
                    the size of a footnote, and did nothing until Save — so somebody
                    filling in a client by hand had no way to know the option
                    existed at all, which is exactly how it was reported.

                    Shown as soon as the option APPLIES, disabled with its reason
                    until there is a name, and it says WHEN it will happen so nobody
                    waits for something that has not been asked for yet.

                    ⚠️ ONLY when the lines are being entered by hand, because that
                    is the only case where the client is genuinely new to us.

                    Picked FROM the CRM: it is already there, and offering to add it
                    would duplicate the record it was read from. Gathered from a
                    WORKSPACE: that customer already exists as a customer workspace,
                    and adding it again makes a second version of one relationship
                    for somebody to keep in step.

                    And never without `crmCaps` — the server's own answer about who
                    may create a client — so the offer cannot appear to somebody it
                    would then refuse.
                  */}
                  {hasCrm && mayAddClient && source === "none" && (
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
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{t("invoices.create.clientEmail")}</Label>
                    <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="h-9 mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("invoices.create.clientAddress")}</Label>
                    <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="h-9 mt-1" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t("invoices.create.issueDate")}</Label>
                  <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">{t("invoices.create.dueDate")}</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">{t("invoices.create.rate")}</Label>
                  <Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 mt-1" placeholder={t("invoices.create.ratePlaceholder")} />
                </div>
                <div>
                  <Label className="text-xs">{t("invoices.create.currency")}</Label>
                  <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} className="h-9 mt-1" />
                </div>
              </div>
              </div>
            </div>

          </div>
        </aside>

        {/* THE ARTEFACT. */}
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[820px] space-y-5">
            {/*
              Working view vs the client's copy.

              ⚠️ Both fill their tables from the SAME rows. The client's copy is
              not a second rendering with its own idea of the numbers — it is
              the same document in a different frame, which is the only version
              of this that cannot start lying.
            */}
            <div className="flex justify-center">
              <div className="inline-grid grid-flow-col gap-0.5 rounded-xl border border-border bg-muted/60 p-1">
                {([
                  ["build", t("invoices.create.viewWorking")],
                  ["client", t("invoices.create.viewClient")],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key as typeof view)}
                    className={cn(
                      "rounded-lg px-4 py-1.5 text-[13px] transition-colors",
                      view === key
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

        {/*
          THE DOCUMENT ITSELF.

          ⚠️ Not a "preview card" among other cards — the invoice, laid out as
          one. The pattern every good invoicing tool converges on, and for a
          reason: somebody building a bill is trying to answer "what will the
          client receive", and nine equal panels of form controls never answer
          it. A sheet does, and it makes a wrong line obvious at a glance.

          The total is the hero, deliberately. It is what the reader looks for
          first on the finished document and what the author is deciding about
          while building it.
        */}
        <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", view !== "build" && "hidden")}>
          {/* ── The head band: who, when, how much ─────────────────────── */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7 sm:py-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("invoices.create.documentEyebrow")}
              </p>
              <p className="mt-1.5 truncate text-lg font-semibold text-foreground">
                {clientName.trim() || t("invoices.create.noClientYet")}
              </p>
              {(clientEmail.trim() || clientAddress.trim()) && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[clientEmail.trim(), clientAddress.trim()].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("invoices.create.total")}
              </p>
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {money(total, currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {t("invoices.create.issueDate")} {fmtDate(issueDate)}
                {dueDate && ` · ${t("invoices.create.dueDate")} ${fmtDate(dueDate)}`}
              </p>
            </div>
          </div>

          {/* ── The lines ──────────────────────────────────────────────── */}
          {documentItems.length === 0 ? (
            /*
              An empty document says what to do next. A blank table with column
              headings and no rows reads as something broken rather than as
              something not started.
            */
            <div className="px-5 py-12 text-center sm:px-7">
              <p className="text-sm text-muted-foreground">{t("invoices.create.emptyDocument")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("invoices.create.emptyDocumentHint")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-2.5 text-left font-medium sm:px-7">{t("invoices.create.descriptionCol")}</th>
                    <th className="w-20 px-2 py-2.5 text-right font-medium">{t("invoices.create.qty")}</th>
                    <th className="w-28 px-2 py-2.5 text-right font-medium">{t("invoices.create.unitPrice")}</th>
                    <th className="w-32 px-5 py-2.5 text-right font-medium sm:px-7">{t("invoices.create.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {documentItems.map((row, i) => (
                    <tr
                      key={`${row.taskId ?? "line"}-${i}`}
                      className={cn(
                        "border-b border-border/50 last:border-0",
                        row.descriptive && "text-muted-foreground",
                      )}
                    >
                      <td className={cn("px-5 py-2.5 sm:px-7", row.descriptive && "pl-9 sm:pl-12")}>
                        {row.descriptive && <span className="mr-1.5 opacity-40">↳</span>}
                        {row.description}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {row.descriptive ? "" : row.quantity}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {row.descriptive ? "" : money(row.unitPrice, currency)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums sm:px-7">
                        {row.descriptive
                          ? <span className="text-xs">{t("invoices.create.included")}</span>
                          : money((row.quantity || 0) * (row.unitPrice || 0), currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── The reckoning, right-aligned under the amounts column ──── */}
          {documentItems.length > 0 && (
            <div className="flex justify-end border-t border-border bg-muted/20 px-5 py-4 sm:px-7">
              <dl className="w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("invoices.create.subtotal")}</dt>
                  <dd className="tabular-nums">{money(subtotal, currency)}</dd>
                </div>
                {Number(discount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("invoices.create.discount")}</dt>
                    <dd className="tabular-nums">−{money(Number(discount), currency)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {t("invoices.create.tax")} {Number(taxPct) > 0 && `(${taxPct}%)`}
                  </dt>
                  <dd className="tabular-nums">{money(taxAmount, currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <dt>{t("invoices.create.total")}</dt>
                  <dd className="tabular-nums">{money(total, currency)}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/*
          THE CLIENT'S COPY — the only surface in this product a customer ever
          sees, and deliberately NOT styled like the app.

          ⚠️ No cards, no muted panels, no UI chrome. Anything that reads as
          software here tells the recipient they are looking at somebody's
          dashboard rather than at a bill. It carries what a real invoice has to
          carry: a letterhead, a number, both parties, terms, and how to pay.

          ⚠️ It renders `documentItems` — the same rows the working view shows
          and the mutation sends. A second rendering with its own arithmetic is
          how a preview starts telling somebody something the document does not.
        */}
        <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", view !== "client" && "hidden")}>
          <div className="px-6 py-8 sm:px-12 sm:py-11">
            {/* Letterhead */}
            <div className="flex flex-wrap justify-between gap-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                    {(org?.name ?? "H").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-[17px] font-bold tracking-tight text-foreground">
                    {org?.name ?? t("invoices.create.yourCompany")}
                  </span>
                </div>
                <p className="mt-2.5 whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">
                  {[org?.addressLine1, [org?.postalCode, org?.city].filter(Boolean).join(" "), org?.country]
                    .filter(Boolean).join("\n") || t("invoices.create.noCompanyAddress")}
                  {org?.vatId ? `\n${org.vatId}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[26px] font-bold uppercase leading-none tracking-[0.14em] text-foreground">
                  {t("invoices.create.documentWord")}
                </p>
                <p className="mt-2 text-[12.5px] tabular-nums text-muted-foreground">
                  {t("invoices.create.numberPending")}
                </p>
              </div>
            </div>

            {/* Both parties, side by side */}
            <div className="mt-8 grid gap-6 border-t border-border pt-5 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("invoices.create.billedTo")}
                </p>
                <p className="mt-2 text-[14.5px] font-semibold text-foreground">
                  {clientName.trim() || "—"}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground">
                  {[clientAddress.trim(), clientEmail.trim()].filter(Boolean).join("\n")}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("invoices.create.detailsCol")}
                </p>
                <dl className="mt-2 grid gap-1.5 text-[12.5px]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("invoices.create.issueDate")}</dt>
                    <dd className="tabular-nums">{fmtDate(issueDate)}</dd>
                  </div>
                  {dueDate && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t("invoices.create.dueDate")}</dt>
                      <dd className="tabular-nums">{fmtDate(dueDate)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("invoices.create.currency")}</dt>
                    <dd className="tabular-nums">{currency}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* The lines */}
            {documentItems.length === 0 ? (
              <p className="py-14 text-center text-sm text-muted-foreground">
                {t("invoices.create.emptyDocument")}
              </p>
            ) : (
              <div className="mt-7 overflow-x-auto">
                <table className="w-full min-w-[26rem] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
                      <th className="py-2 text-left font-medium">{t("invoices.create.descriptionCol")}</th>
                      <th className="w-16 py-2 text-right font-medium">{t("invoices.create.qty")}</th>
                      <th className="w-24 py-2 text-right font-medium">{t("invoices.create.unitPrice")}</th>
                      <th className="w-28 py-2 text-right font-medium">{t("invoices.create.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentItems.map((row, i) => (
                      <tr
                        key={`c-${row.taskId ?? "line"}-${i}`}
                        className={cn("border-b border-border/50 last:border-0", row.descriptive && "text-muted-foreground")}
                      >
                        <td className={cn("py-2.5", row.descriptive && "pl-5 text-[12.5px]")}>
                          {row.descriptive && <span className="mr-1.5 opacity-40">↳</span>}
                          {row.description}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{row.descriptive ? "" : row.quantity}</td>
                        <td className="py-2.5 text-right tabular-nums">{row.descriptive ? "" : money(row.unitPrice, currency)}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {row.descriptive
                            ? <span className="text-[11px]">{t("invoices.create.included")}</span>
                            : money((row.quantity || 0) * (row.unitPrice || 0), currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {documentItems.length > 0 && (
              <>
                <div className="mt-2 flex justify-end">
                  <dl className="w-full max-w-[264px] text-[13.5px]">
                    <div className="flex justify-between py-1">
                      <dt className="text-muted-foreground">{t("invoices.create.subtotal")}</dt>
                      <dd className="tabular-nums">{money(subtotal, currency)}</dd>
                    </div>
                    {Number(discount) > 0 && (
                      <div className="flex justify-between py-1">
                        <dt className="text-muted-foreground">{t("invoices.create.discount")}</dt>
                        <dd className="tabular-nums">−{money(Number(discount), currency)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between py-1">
                      <dt className="text-muted-foreground">
                        {t("invoices.create.tax")} {Number(taxPct) > 0 && `(${taxPct}%)`}
                      </dt>
                      <dd className="tabular-nums">{money(taxAmount, currency)}</dd>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-border pt-2.5 text-[15.5px] font-semibold">
                      <dt>{t("invoices.create.total")}</dt>
                      <dd className="tabular-nums">{money(total, currency)}</dd>
                    </div>
                  </dl>
                </div>

                {/* What the recipient is actually looking for. */}
                <div className="mt-4 flex items-baseline justify-between gap-5 rounded-xl bg-brand-600/10 px-4 py-3.5">
                  <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                    {t("invoices.create.amountDue")}
                  </span>
                  <span className="text-[19px] font-semibold tabular-nums tracking-tight text-brand-700 dark:text-brand-300">
                    {money(total, currency)}
                  </span>
                </div>
              </>
            )}

            {/* Terms — how to pay, and anything the biller wanted to say. */}
            <div className="mt-8 grid gap-6 border-t border-border pt-5 text-[12px] leading-relaxed text-muted-foreground sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                  {t("invoices.create.payment")}
                </p>
                {/*
                  ⚠️ The organisation profile carries no bank details, so this
                  says where to add them rather than printing a blank line. An
                  invoice with an empty Payment block is worse than one that
                  admits the detail is missing — the client cannot pay either
                  way, and only one of the two tells anybody why.
                */}
                <p>{t("invoices.create.noBankDetails")}</p>
              </div>
              {notes.trim() && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                    {t("invoices.create.notes")}
                  </p>
                  <p className="whitespace-pre-line">{notes.trim()}</p>
                </div>
              )}
            </div>
          </div>
        </div>

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

        {/* Manual / extra lines */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
            <p className="text-sm font-medium text-foreground">{t("invoices.create.extraLines")}</p>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-7" onClick={addManual}>
              <Plus className="size-3.5" /> {t("invoices.create.addLine")}
            </Button>
          </div>
          {manualLines.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-5">{t("invoices.create.noExtraLines")}</p>
          ) : (
            manualLines.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_100px_100px_32px] gap-2 px-4 py-2 border-b border-border/20 items-center">
                <Input value={m.description} onChange={(e) => setManual(i, { description: e.target.value })} placeholder={t("invoices.create.descriptionPlaceholder")} className="h-8 text-sm" />
                <Input type="number" value={m.quantity} onChange={(e) => setManual(i, { quantity: Number(e.target.value) })} className="h-8 text-sm text-right" />
                <Input type="number" value={m.unitPrice} onChange={(e) => setManual(i, { unitPrice: Number(e.target.value) })} className="h-8 text-sm text-right" />
                <span className="text-sm text-right tabular-nums font-medium">{money((Number(m.quantity) || 0) * (Number(m.unitPrice) || 0), currency)}</span>
                <button onClick={() => removeManual(i)} className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-500/10"><Trash2 className="size-3.5" /></button>
              </div>
            ))
          )}
        </div>
          </div>
        </main>
      </div>
    </div>
  )
}
