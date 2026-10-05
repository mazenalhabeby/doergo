"use client"

import { PlanGate } from "@/components/plan-gate"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Loader2, Clock, Package, FileText, ChevronDown, ChevronRight, CalendarDays } from "lucide-react"

import { invoicesApi, locationsApi, customersApi, organizationsApi, spaceMembersApi, type Invoice, type InvoiceItemInput } from "@/lib/api"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAuth } from "@/contexts/auth-context"
import {
  buildLabourLines,
  buildWorkspaceLines,
  labourTotalCents,
  type LabourGrouping,
  type LabourEntry,
  type DayEntry,
  type HoursEntry,
  type PersonWork,
  formatHoursMinutes,
} from "@hbcfield/shared/client"
import { formatDayKey } from "@/lib/day-key"
import { Switch } from "@/components/ui/switch"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import {
  InvoiceTopBar, InvoiceNotice, InvoiceWorkbench, RailSection,
} from "../_components/invoice-shell"
import { InvoiceDocument, money, fmtDate } from "../_components/invoice-document"
import { LabourCostPanel } from "../_components/labour-cost-panel"
import { labourCostRows } from "../_lib/labour-cost-rows"
import {
  ClientFields, TermsFields, LineEditor, num, type EditableLine,
} from "../_components/invoice-fields"
import { useExchangeRate } from "../_lib/use-exchange-rate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"
import { PeriodPicker, periodDays, periodQuery, type PeriodValue } from "@/components/ui/period-picker"
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
  workerId?: string | null
  /** The worker's trade here; decides the heading the line sits under. */
  workRoleId?: string | null
  workRoleName?: string | null
  /** False = billed by the day only: listed on the invoice, not charged by the hour. */
  hoursBillable: boolean
  /** How this person is billed here — decides where their COST is counted. */
  billBy: "HOUR" | "DAY" | "BOTH"
}

/** A run of days worked at one day rate, as the screen holds it. */
type DayRun = DayEntry & { key: string; include: boolean }
/** A run of hours on site at one hourly rate, as the screen holds it. */
type HourRun = HoursEntry & { key: string; include: boolean }
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

/** "Sarah Wagner" → "SW", for the avatar beside a gathered job. */
function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"
}

/** How a labour line's description reads. Remembered per browser — a convenience, not a record. */
type LineStyle = { words: "full" | "name"; dates: boolean; tags: boolean }
const LINE_STYLE_KEY = "hbc.invoice.lineStyle"
const DEFAULT_LINE_STYLE: LineStyle = { words: "full", dates: true, tags: true }
function readLineStyle(): LineStyle {
  const fallback = DEFAULT_LINE_STYLE
  try {
    const v = JSON.parse(localStorage.getItem(LINE_STYLE_KEY) ?? "null")
    if (!v || typeof v !== "object") return fallback
    return {
      words: v.words === "name" ? "name" : "full",
      dates: v.dates !== false,
      tags: v.tags !== false,
    }
  } catch {
    return fallback
  }
}

const BASIS_TONE: Record<string, string> = {
  SHIFT: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  CLOCKED: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  COUNTED: "bg-green-500/15 text-green-700 dark:text-green-300",
}

/**
 * Which hours a person's line bills — and, where the person belongs to the
 * workspace, the switch: each choice with the hours it would bill. Choosing
 * saves it on the person in this workspace (the same setting as their panel),
 * and the line follows. Working view only, never the client's copy.
 */
function HoursBasisChip({
  basis, hoursByBasis, spaceId, assignmentId,
}: {
  basis?: string | null
  hoursByBasis?: Record<string, number>
  spaceId?: string | null
  assignmentId?: string | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (b: "COUNTED" | "CLOCKED" | "SHIFT") => spaceMembersApi.updateRoles(spaceId!, assignmentId!, { hoursBasis: b }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-gather"] })
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
      notify.success(t("invoices.create.basisSaved"))
    },
    onError: (e: Error) => notify.error(e.message),
  })
  if (!basis) return null
  const chip = (
    <span className={cn("ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", BASIS_TONE[basis] ?? BASIS_TONE.COUNTED)}>
      {save.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
      {t(`scheduling.membersPage.basis.${basis}`)}
      {spaceId && assignmentId && hoursByBasis && <ChevronDown className="size-3" />}
    </span>
  )
  if (!spaceId || !assignmentId || !hoursByBasis) return chip
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("scheduling.membersPage.hoursBasis")}>
        {chip}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">{t("scheduling.membersPage.hoursBasis")}</DropdownMenuLabel>
        {(["COUNTED", "CLOCKED", "SHIFT"] as const).map((b) => (
          <DropdownMenuItem key={b} onSelect={() => b !== basis && save.mutate(b)} className="flex items-center justify-between gap-3">
            <span className={cn(b === basis && "font-semibold")}>{t(`scheduling.membersPage.basis.${b}`)}</span>
            <span className="tabular-nums text-muted-foreground">{formatHoursMinutes(hoursByBasis[b] ?? 0)}</span>
          </DropdownMenuItem>
        ))}
        <p className="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">{t("invoices.create.basisSavedHint")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
  const [periodValue, setPeriodValue] = useState<PeriodValue>({ mode: "all", from: "", to: "" })
  // The calendar's dots need every unbilled day — loaded only once it is opened.
  const [periodOpen, setPeriodOpen] = useState(false)

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
  const [currencySource, setCurrencySource] = useState<"workspace" | "client" | "organization" | null>(null)
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
  const [lineStyle, setLineStyleState] = useState<LineStyle>(DEFAULT_LINE_STYLE)
  // Read after mount: the server render has no storage, and both renders must match.
  useEffect(() => { setLineStyleState(readLineStyle()) }, [])
  const setLineStyle = (patch: Partial<LineStyle>) =>
    setLineStyleState((prev) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(LINE_STYLE_KEY, JSON.stringify(next)) } catch { /* private window: not remembered, still applied */ }
      return next
    })
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
    queryKey: ["organization-profile"],
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
  const period = periodQuery(periodValue)

  const gatherSource = source === "space" && spaceId
    ? { spaceId, ...period }
    : source === "client" && customerId
      ? { customerId, ...period }
      : null
  /*
    ⚠️ ALWAYS FRESH. What is still to bill moves whenever a rate, a role, a
    clock-in or another invoice changes — often in another tab a moment ago.
    Read on every visit and on returning to the window, never from a cache.
  */
  const { data: gather, isLoading: gatherLoading } = useQuery({
    queryKey: ["invoice-gather", gatherSource],
    queryFn: () => invoicesApi.gather(gatherSource!),
    enabled: !!gatherSource,
    staleTime: 0,
    refetchOnWindowFocus: true,
    /*
      Keep the lines on screen while another period loads — but only for the
      SAME workspace or client, never another one's lines under a new name.
    */
    placeholderData: (prev, prevQuery) => {
      const was = prevQuery?.queryKey[1] as { spaceId?: string; customerId?: string } | null | undefined
      return was && gatherSource && was.spaceId === (gatherSource as any).spaceId && was.customerId === (gatherSource as any).customerId
        ? prev
        : undefined
    },
  })
  /*
    Every unbilled day, whatever period is chosen — the same request as
    "Outstanding" (one cache entry), asked for only when it is not already the
    one on screen and the calendar is open.
  */
  const allSource = gatherSource ? { ...gatherSource, from: undefined, to: undefined } : null
  const { data: allGather } = useQuery({
    queryKey: ["invoice-gather", allSource],
    queryFn: () => invoicesApi.gather(allSource!),
    enabled: !!allSource && periodValue.mode !== "all" && periodOpen,
    staleTime: 30_000,
  })
  const workDays: string[] | undefined = periodValue.mode === "all"
    ? gather?.outstandingDays
    : allGather?.outstandingDays
  // The days this invoice covers — shown, sent and stored as the same two dates.
  const { from: periodFrom, to: periodTo } = periodDays(periodValue, workDays)

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
  const linesFrom = useRef<unknown>(null)
  useEffect(() => {
    if (gather && seeded && linesFrom.current !== gather) applyLines(gather)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gather, seeded])

  /** `fresh`: a new source (another workspace or client) — nothing of the old lists carries over. */
  function applyLines(g: NonNullable<typeof gather>, fresh = false) {
    // The server's previous hours per job — a line whose hours differ from them was typed over.
    const before = linesFrom.current as typeof g | null
    const serverHoursBefore = new Map((before?.workEntries ?? []).map((w) => [w.taskId, w.hours ?? 0]))
    linesFrom.current = g
      setEntries((prev) => {
        const was = new Map((fresh ? [] : prev).map((e) => [e.taskId, e]))
        return (g.workEntries || []).map((w) => ({
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
          workerId: w.workerId ?? null,
          workRoleId: w.workRoleId ?? null,
          workRoleName: w.workRoleName ?? null,
          hoursBillable: w.hoursBillable !== false,
          billBy: w.billBy ?? "HOUR",
        })).map((e) => {
          const old = was.get(e.taskId)
          if (!old) return e
          const typedOver = old.hours !== serverHoursBefore.get(e.taskId)
          return { ...e, include: old.include, includeParts: old.includeParts, hours: typedOver ? old.hours : e.hours }
        })
      })
      setDayRuns((prev) => {
        const on = new Map((fresh ? [] : prev).map((d) => [d.key, d.include]))
        return (g.dayEntries || []).map((d) => {
          const key = `${d.workerId}|${d.fromDay}`
          return { ...d, key, include: on.get(key) ?? true }
        })
      })
      setHourRuns((prev) => {
        const on = new Map((fresh ? [] : prev).map((h) => [h.key, h.include]))
        return (g.hourEntries || []).map((h) => {
          const key = `${h.workerId}|${h.fromDay}`
          return { ...h, key, include: on.get(key) ?? true }
        })
      })
  }

  const rateNum = Number(rate) || 0

  const setEntry = (taskId: string, patch: Partial<WorkEntry>) =>
    setEntries((prev) => prev.map((e) => (e.taskId === taskId ? { ...e, ...patch } : e)))

  /** This entry's own hourly rate in euros, or the form's fallback. */
  const entryRate = (e: WorkEntry) => (e.billRateCents != null ? e.billRateCents / 100 : rateNum)
  // Day-billed work is listed but not charged by the hour — the days pay for it.
  const entryLabor = (e: WorkEntry) => (e.include && e.hoursBillable ? e.hours * entryRate(e) : 0)
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
          workerId: e.workerId ?? null,
          workRoleId: e.workRoleId ?? null,
          workRoleName: e.workRoleName ?? null,
          hoursBillable: e.hoursBillable,
        })),
    [entries, rateNum],
  )
  const includedDays = useMemo(() => dayRuns.filter((d) => d.include), [dayRuns])
  const includedHours = useMemo(() => hourRuns.filter((h) => h.include), [hourRuns])
  const anyWorkRole = entries.some((e) => e.workRoleId) || dayRuns.some((d) => d.workRoleId) || hourRuns.some((h) => h.workRoleId)
  // A WORKSPACE invoice charges each person's time on site; a CLIENT invoice charges job hours.
  const siteMode = !!gather?.spaceId

  const range = (from: string, to: string) => ({
    from: formatDayKey(from, i18n.language, { year: false }),
    to: formatDayKey(to, i18n.language, { year: false }),
  })
  /*
    One labour line's words, by the chosen style. The tag, the "72 h" and the
    "/ hour" already say what the line is, so "hours worked" may go; the dates
    only appear where a line covers part of the period.
  */
  const describe = (kind: "hours" | "days", name: string, count: number, split: boolean, fromDay: string, toDay: string) => {
    const dated = split && lineStyle.dates
    if (lineStyle.words === "name") {
      return dated ? t("invoices.create.nameLineRange", { name, ...range(fromDay, toDay) }) : name
    }
    if (kind === "hours") {
      return dated ? t("invoices.create.hoursLineRange", { name, ...range(fromDay, toDay) }) : t("invoices.create.hoursLine", { name })
    }
    return dated
      ? t("invoices.create.daysLineRange", { name, count, ...range(fromDay, toDay) })
      : t("invoices.create.daysLine", { name, count })
  }
  const labourLines = useMemo(
    () => siteMode
      ? buildWorkspaceLines(
          (() => {
            const people = new Map<string, PersonWork>()
            const person = (id: string, name: string, roleId?: string | null, roleName?: string | null) => {
              const p = people.get(id) ?? { workerId: id, workerName: name, workRoleId: roleId ?? null, workRoleName: roleName ?? null, hours: [], days: [], jobs: [] }
              if (!p.workRoleId && roleId) { p.workRoleId = roleId; p.workRoleName = roleName ?? null }
              people.set(id, p)
              return p
            }
            for (const h of includedHours) person(h.workerId, h.workerName, h.workRoleId, h.workRoleName).hours.push(h)
            for (const d of includedDays) person(d.workerId, d.workerName, d.workRoleId, d.workRoleName).days.push(d)
            for (const e of labourEntries) {
              if (!e.workerId) continue
              person(e.workerId, e.workerName ?? t("invoices.create.unassignedWorker"), e.workRoleId, e.workRoleName).jobs.push(e)
            }
            return [...people.values()]
          })(),
          {
            listJobs: grouping === "both",
            groupByRole,
            noRoleLabel: t("invoices.create.otherRole"),
            describeHours: (h, split) => describe("hours", h.workerName, h.hours, split, h.fromDay, h.toDay),
            describeDays: (d, split) => describe("days", d.workerName, d.days, split, d.fromDay, d.toDay),
          },
        )
      : buildLabourLines(labourEntries, grouping, t("invoices.create.unassignedWorker"), {
        days: includedDays,
        groupByRole,
        noRoleLabel: t("invoices.create.otherRole"),
        // The reader's language and the reader's dates; the shared rule only arranges.
        describeDays: (d, split) => describe("days", d.workerName, d.days, split, d.fromDay, d.toDay),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labourEntries, grouping, t, includedDays, includedHours, groupByRole, i18n.language, siteMode, lineStyle],
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
        billedDays: line.billedDays,
        lineKind: line.kind,
        workerId: line.workerId,
        dayFrom: line.dayFrom,
        dayTo: line.dayTo,
        taskIds: line.taskIds,
        hoursBasis: line.hoursBasis ?? null,
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
        ...exchange.payload,
        showLineTags: lineStyle.tags,
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
      // What it billed is no longer to bill.
      queryClient.invalidateQueries({ queryKey: ["invoice-gather"] })

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
                  <PeriodPicker
                    className="mt-2"
                    value={periodValue}
                    onChange={setPeriodValue}
                    workDays={workDays}
                    onOpenChange={setPeriodOpen}
                  />
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
                    ] as const).filter(([key]) => !siteMode || key !== "task").map(([key, label]) => (
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
              {/*
                Group under work roles — on/off per invoice, independent of how
                the labour is written up. Offered only where somebody has a
                trade; without one there is nothing to group by.
              */}
              {anyWorkRole && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="group-by-role" className="text-xs">{t("invoices.create.groupByRole")}</Label>
                    <Switch id="group-by-role" checked={groupByRole} onCheckedChange={setGroupByRole} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {groupByRole ? t("invoices.create.groupByRoleOn") : t("invoices.create.groupByRoleOff")}
                  </p>
                </div>
              )}
              {/*
                What a labour line says. The same words go onto the client's
                copy and the PDF — they ARE the line's text — and the tag choice
                is saved with the invoice.
              */}
              <div className="mt-4 space-y-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-foreground">{t("invoices.create.lineStyle")}</p>
                <div role="radiogroup" aria-label={t("invoices.create.lineStyle")} className="grid gap-1 rounded-xl border border-border bg-muted/50 p-1">
                  {(["full", "name"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={lineStyle.words === w}
                      onClick={() => setLineStyle({ words: w })}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        lineStyle.words === w ? "bg-card shadow-sm" : "hover:bg-card/60",
                      )}
                    >
                      <span className="block text-xs font-semibold text-foreground">{t(`invoices.create.lineWords.${w}`)}</span>
                      <span className="block text-[11px] text-muted-foreground">{t(`invoices.create.lineWords.${w}Example`)}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="line-dates" className="text-xs">{t("invoices.create.lineDates")}</Label>
                  <Switch id="line-dates" checked={lineStyle.dates} onCheckedChange={(v) => setLineStyle({ dates: v })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="line-tags" className="text-xs">{t("invoices.create.lineTags")}</Label>
                  <Switch id="line-tags" checked={lineStyle.tags} onCheckedChange={(v) => setLineStyle({ tags: v })} />
                </div>
              </div>
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
                currency={currency}
                setCurrency={(c) => { setCurrency(c); setCurrencySource(null) }}
                currencySource={currencySource}
                exchange={exchange}
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
            ) : entries.length === 0 && dayRuns.length === 0 && hourRuns.length === 0 ? (
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
                              /> h × {money(entryRate(e), currency)}
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

            {/*
              Days worked — for people billed by the day. One row per run at one
              day rate, so a rate change inside the period is two rows here
              exactly as it is two lines on the invoice.
            */}
            {hourRuns.length > 0 && (
              <div className="mt-3 space-y-2">
                {hourRuns.map((h) => (
                  <div
                    key={h.key}
                    className={cn("flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors", h.include ? "border-border" : "border-border/40 opacity-60")}
                  >
                    <Checkbox
                      checked={h.include}
                      onCheckedChange={(v) => setHourRuns((prev) => prev.map((x) => (x.key === h.key ? { ...x, include: !!v } : x)))}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-foreground">
                          <span className="mr-2 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">{t("invoices.create.tagHours")}</span>
                          {h.workerName}
                          {h.workRoleName && <span className="ml-2 text-xs font-normal text-muted-foreground">{h.workRoleName}</span>}
                          <HoursBasisChip basis={h.hoursBasis} hoursByBasis={h.hoursByBasis} spaceId={gather?.spaceId} assignmentId={h.assignmentId} />
                        </p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {money(Math.round(h.hours * (h.hourRateCents ?? 0)) / 100, currency)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {t("invoices.create.hoursOnSite", { hours: formatHoursMinutes(h.hours), days: h.days })} × {money((h.hourRateCents ?? 0) / 100, currency)}
                        </span>
                        <span>
                          {formatDayKey(h.fromDay, i18n.language)}
                          {h.toDay !== h.fromDay && ` – ${formatDayKey(h.toDay, i18n.language)}`}
                        </span>
                      </div>
                      {(h.noShiftDays ?? 0) > 0 && (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                          {t("invoices.create.noShiftDays", { count: h.noShiftDays })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dayRuns.length > 0 && (
              <div className="mt-3 space-y-2">
                {dayRuns.map((d) => (
                  <div
                    key={d.key}
                    className={cn("flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors", d.include ? "border-border" : "border-border/40 opacity-60")}
                  >
                    <Checkbox
                      checked={d.include}
                      onCheckedChange={(v) => setDayRuns((prev) => prev.map((x) => (x.key === d.key ? { ...x, include: !!v } : x)))}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-foreground">
                          <span className="mr-2 rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">{t("invoices.create.tagDays")}</span>
                          {d.workerName}
                          {d.workRoleName && <span className="ml-2 text-xs font-normal text-muted-foreground">{d.workRoleName}</span>}
                        </p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {money(((d.dayRateCents ?? 0) * d.days) / 100, currency)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3" />
                          {t("invoices.create.daysWorked", { count: d.days })} × {money((d.dayRateCents ?? 0) / 100, currency)}
                        </span>
                        <span>
                          {formatDayKey(d.fromDay, i18n.language)}
                          {d.toDay !== d.fromDay && ` – ${formatDayKey(d.toDay, i18n.language)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
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
