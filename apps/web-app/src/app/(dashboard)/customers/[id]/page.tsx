"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Mail, Phone, MapPin, Send, Copy, Check, Trash2,
  StickyNote, PhoneCall, Mails, Users, Clock, RefreshCw, Settings2, Loader2,
  Smartphone, CheckCircle2, AlertTriangle, CalendarClock, Plus,
  Building2, Bell,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { TFunction } from "i18next"

import { customersApi, locationsApi, organizationsApi, tasksApi, spacePortalApi, type CustomerActivity, type Customer, type PortalSummary, type Task } from "@/lib/api"
import { CUSTOMER_STAGES, customerStageLabel } from "@hbcfield/shared/client"
import { CreateTaskDialog } from "../../tasks/_components/create-task-dialog"
import { CheckSquare, Repeat, ChevronDown as ChevronDownIcon } from "lucide-react"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { CustomerForm } from "../../locations/[id]/_components/customers-tab"
import { AddressesPanel } from "./customer-addresses"
import { ManagersPanel } from "./customer-managers"

// stage tone → dot color
const STAGE_DOT: Record<string, string> = {
  slate: "bg-slate-400", blue: "bg-blue-500", violet: "bg-violet-500", green: "bg-emerald-500", gray: "bg-gray-400",
}
function stageDot(key: string) {
  return STAGE_DOT[CUSTOMER_STAGES.find((s) => s.key === key)?.tone ?? "slate"] ?? "bg-slate-400"
}

// ── helpers ───────────────────────────────────────────────────────────────────
const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600", "from-emerald-500 to-teal-600", "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600", "from-rose-500 to-pink-600", "from-cyan-500 to-sky-600",
]
function gradientFor(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}
function relTime(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
const dayKey = (iso: string) => { const d = new Date(iso); d.setHours(0, 0, 0, 0); return d.getTime() }
function dayLabel(iso: string, t: TFunction) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - dayKey(iso)) / 86400000
  if (diff === 0) return t("customers.today", "Today")
  if (diff === 1) return t("customers.yesterday", "Yesterday")
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
}
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : "")
const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "")

const COMPOSER = [
  { type: "NOTE", label: "Note", icon: StickyNote },
  { type: "REMINDER", label: "Reminder", icon: Clock },
] as const

// What a reminder is for (its "reason"/channel). Meetings are real work → a Task.
const REMINDER_KINDS = [
  { key: "CALL", label: "Call", icon: PhoneCall },
  { key: "EMAIL", label: "Email", icon: Mails },
  { key: "OTHER", label: "Other", icon: StickyNote },
] as const

const REPEAT_OPTIONS: { v: string; label: string }[] = [
  { v: "NONE", label: "Does not repeat" },
  { v: "DAILY", label: "Daily" },
  { v: "WEEKLY", label: "Weekly" },
  { v: "MONTHLY", label: "Monthly" },
]

/**
 * One row of the customer feed.
 *
 * The feed mixes two sources — activity records and this customer's tasks — so
 * a task is wrapped as an activity-shaped row with the task attached. That
 * wrapping used to be `as any` twice over, which meant the sort and the
 * renderer below were both reading fields nothing checked.
 */
type FeedItem = CustomerActivity | {
  id: string
  type: "TASK"
  createdAt: string
  task: Task
}

// Dynamic lead time — alert this many minutes before the due time.
const LEAD_OPTIONS: { v: number; label: string }[] = [
  { v: 0, label: "At time" },
  { v: 5, label: "5 min before" },
  { v: 15, label: "15 min before" },
  { v: 30, label: "30 min before" },
  { v: 60, label: "1 hour before" },
  { v: 180, label: "3 hours before" },
  { v: 1440, label: "1 day before" },
  { v: 2880, label: "2 days before" },
  { v: 10080, label: "1 week before" },
]
const REMINDER_KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  CALL: { label: "Call", icon: PhoneCall },
  EMAIL: { label: "Email", icon: Mails },
  MEETING: { label: "Meeting", icon: Users },
  OTHER: { label: "Follow-up", icon: StickyNote },
}
function leadLabel(min?: number | null) {
  if (!min) return null
  return LEAD_OPTIONS.find((o) => o.v === min)?.label ?? `${min} min before`
}

// ══════════════════════════════════════════════════════════════════════════════
export default function CustomerRecordPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [tab, setTab] = useState<"activity" | "notes" | "reminders">("activity")

  const customerQ = useQuery({ queryKey: ["customer", id], queryFn: () => customersApi.get(id) })
  const activityQ = useQuery({ queryKey: ["customer-activities", id], queryFn: () => customersApi.activities(id) })
  const customer = customerQ.data
  const tasksQ = useQuery({
    queryKey: ["customer-tasks", id],
    queryFn: () => tasksApi.list({ customerId: id, limit: 50 }),
    enabled: !!customer,
  })
  const spaceQ = useQuery({
    queryKey: ["location", customer?.spaceId],
    queryFn: () => locationsApi.getById(customer!.spaceId!),
    enabled: !!customer?.spaceId,
  })
  const hasB2C = !!spaceQ.data?.enabledModules?.includes("b2c_portal")

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customer", id] })
    qc.invalidateQueries({ queryKey: ["customer-activities", id] })
    qc.invalidateQueries({ queryKey: ["customer-tasks", id] })
  }
  const setStatus = useMutation({
    mutationFn: (status: string) => customersApi.update(id, { status }),
    onSuccess: refresh,
    onError: (e: Error) => notify.error(e.message || "Could not update status"),
  })

  if (customerQ.isLoading) {
    return <div className="mx-auto max-w-6xl p-6 space-y-4"><Skeleton className="h-48 w-full rounded-2xl" /><Skeleton className="h-72 w-full rounded-2xl" /></div>
  }
  if (!customer) {
    return <div className="mx-auto max-w-6xl p-6 text-center text-muted-foreground">{t("customers.notFound", "Customer not found")}</div>
  }

  const activities = activityQ.data ?? []
  const tasks = tasksQ.data?.data ?? []
  const openReminders = activities.filter((a) => a.type === "REMINDER" && !a.doneAt)
  const overdue = openReminders.filter((a) => a.dueAt && new Date(a.dueAt).getTime() < Date.now())
  const status = customer.status || "LEAD"
  const grad = gradientFor(customer.name)
  const isCompany = customer.type === "COMPANY"
  const website = customer.website
  const websiteHref = website ? (website.startsWith("http") ? website : `https://${website}`) : undefined

  // Unified feed: activities + this customer's tasks, newest first.
  const taskItems: FeedItem[] = tasks.map((tk) => ({
    id: `task-${tk.id}`,
    type: "TASK",
    createdAt: tk.createdAt,
    task: tk,
  }))
  const feed: FeedItem[] = [...activities, ...taskItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  // Smart nudges (only while sales works the customer — not an app customer).
  const lastAt = activities[0]?.createdAt ? new Date(activities[0].createdAt).getTime() : 0
  const staleDays = lastAt ? Math.floor((Date.now() - lastAt) / 86400000) : null
  const showNoNextStep = !customer.isPortalResident && openReminders.length === 0
  const showStale = !customer.isPortalResident && staleDays != null && staleDays >= 14

  const filtered = tab === "activity"
    ? feed
    : tab === "reminders"
      ? activities.filter((a) => a.type === "REMINDER")
      : activities.filter((a) => a.type === "NOTE")

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Back to wherever they came from — the member CRM list (/clients) or, for
          a space manager, the space's Customers tab. history.back handles both. */}
      <button onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("common.back", "Back")}
      </button>

      {/* ── HEADER ── */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* left: avatar + name (+ app access under) */}
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center bg-gradient-to-br text-lg font-bold text-white shadow-sm",
              isCompany ? "rounded-xl" : "rounded-full", grad)}>
              {isCompany ? <Building2 className="h-6 w-6" /> : initials(customer.name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{customer.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {isCompany ? <><Building2 className="h-3 w-3" /> {t("customers.typeCompany", "Company")}</> : <><Users className="h-3 w-3" /> {t("customers.typePerson", "Person")}</>}
                </span>
                {customer.industry && <span className="text-[11px] text-muted-foreground">{customer.industry}</span>}
                {customer.isPortalResident && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* right: actions + status + edit */}
          <div className="flex flex-wrap items-center gap-2">
            {customer.phone && <IconBtn icon={Phone} href={`tel:${customer.phone}`} label={t("customers.call", "Call")} />}
            {customer.email && <IconBtn icon={Mail} href={`mailto:${customer.email}`} label={t("customers.email", "Email")} />}
            {customer.isPortalResident ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> {t("customers.activeCustomer", "Active customer")}
              </span>
            ) : (
              <StatusPill current={status} onSet={(s) => setStatus.mutate(s)} pending={setStatus.isPending} />
            )}
            <CustomerForm existing={customer} onSaved={refresh} trigger={
              <Button variant="outline" size="sm"><Settings2 className="mr-1.5 h-3.5 w-3.5" /> {t("common.edit", "Edit")}</Button>
            } />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* ── LEFT: About panel ── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Panel>
            <PanelHead>{t("customers.about", "About")}</PanelHead>
            <dl className="divide-y divide-border/60 text-sm">
              <PropRow label={isCompany ? t("customers.companyEmail", "Company email") : t("customers.email", "Email")} value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
              <PropRow label={isCompany ? t("customers.companyPhone", "Company phone") : t("customers.phone", "Phone")} value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
              {isCompany && <>
                <PropRow label={t("customers.website", "Website")} value={website?.replace(/^https?:\/\//, "")} href={websiteHref} />
                <PropRow label={t("customers.legalName", "Legal name")} value={customer.legalName} />
                <PropRow label={t("customers.industry", "Industry")} value={customer.industry} />
                <PropRow label={t("customers.vatId", "VAT / UID")} value={customer.vatId} />
                <PropRow label={t("customers.regNumber", "Register no.")} value={customer.regNumber} />
              </>}
              {(customer.details ?? []).filter((d) => d.label && d.value).map((d, i) => (
                <PropRow key={i} label={d.label} value={d.value} />
              ))}
              <PropRow label={t("customers.added", "Added")} value={fmtDate(customer.createdAt)} />
            </dl>
            {customer.notes && <p className="mt-3 rounded-lg bg-muted/50 p-3 text-[13px] leading-relaxed text-muted-foreground">{customer.notes}</p>}
          </Panel>

          {/* Sales managers — only while the customer is worked by sales (no app access). */}
          {!customer.isPortalResident && <ManagersPanel customer={customer} ownerId={customer.ownerId ?? undefined} onChanged={refresh} />}

          <AddressesPanel customerId={id} spaceId={customer.spaceId ?? undefined} hasPortal={hasB2C} portalId={customer.portalId ?? undefined} />

          <InviteCard customer={customer} hasB2C={hasB2C} onChanged={refresh} />
        </aside>

        {/* ── MAIN: composer + tabs + timeline ── */}
        <main className="min-w-0 space-y-4">
          <Composer customer={customer} onAdded={refresh} />

          {/* Smart nudges — keep the relationship moving. */}
          {showNoNextStep && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <Bell className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t("customers.nudgeNoNext", "No follow-up scheduled.")}{staleDays != null && staleDays > 0 ? ` ${t("customers.lastActivityDays", "Last activity {{d}}d ago.", { d: staleDays })}` : ""}</span>
              <QuickRemind customerId={id} onAdded={refresh} />
            </div>
          )}
          {showStale && !showNoNextStep && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" /> {t("customers.nudgeStale", "No activity in {{d}} days — time to check in?", { d: staleDays })}
            </div>
          )}

          <div className="flex items-center gap-1 border-b border-border/70">
            {([
              ["activity", t("customers.tabActivity", "Activity"), feed.length],
              ["notes", t("customers.tabNotes", "Notes"), null],
              ["reminders", t("customers.tabReminders", "Reminders"), openReminders.length || null],
            ] as const).map(([key, label, count]) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn("relative -mb-px flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
                  tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {label}
                {count != null && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  key === "reminders" && overdue.length ? "bg-red-100 text-red-600 dark:bg-red-950/50" : "bg-muted text-muted-foreground")}>{count}</span>}
                {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          {overdue.length > 0 && tab !== "reminders" && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" /> {t("customers.overdueCount", "{{count}} overdue follow-up", { count: overdue.length })}
            </div>
          )}

          <Timeline customerId={id} loading={activityQ.isLoading} activities={filtered} empty={tab} onChanged={refresh} />
        </main>
      </div>
    </div>
  )
}

// ── Status pill (clean, Attio-style) ──────────────────────────────────────────
function StatusPill({ current, onSet, pending }: { current: string; onSet: (s: string) => void; pending: boolean }) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={pending}>
        <button className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60">
          <span className={cn("h-2 w-2 rounded-full", stageDot(current))} />
          {customerStageLabel(current)}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {CUSTOMER_STAGES.map((s) => (
          <DropdownMenuItem key={s.key} onClick={() => onSet(s.key)} className="gap-2">
            <span className={cn("h-2 w-2 rounded-full", stageDot(s.key))} />
            <span className="flex-1">{t(`customers.stageKey.${s.key.toLowerCase()}`, s.label)}</span>
            {s.key === current && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function IconBtn({ icon: Icon, href, label }: { icon: LucideIcon; href: string; label: string }) {
  return (
    <a href={href} title={label} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
      <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
    </a>
  )
}
function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border/70 bg-card p-4">{children}</div>
}
function PanelHead({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
}
function PropRow({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      {href
        ? <a href={href} className="truncate text-right font-medium text-foreground transition-colors hover:text-primary">{value}</a>
        : <dd className="truncate text-right font-medium text-foreground">{value}</dd>}
    </div>
  )
}

// ── Composer ────────────────────────────────────────────────────────────────
function Composer({ customer, onAdded }: { customer: Customer; onAdded: () => void }) {
  const { t } = useTranslation()
  const customerId = customer.id
  const [type, setType] = useState<string>("NOTE")
  const [body, setBody] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [kind, setKind] = useState<string>("CALL")
  const [lead, setLead] = useState<number>(0)
  const [repeat, setRepeat] = useState<string>("NONE")
  const [assigneeId, setAssigneeId] = useState<string>("")
  const [focused, setFocused] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const isReminder = type === "REMINDER"

  // Assigned managers = who can be picked to receive a reminder.
  const membersQ = useQuery({ queryKey: ["org-members-assignable"], queryFn: () => organizationsApi.getMembers({ limit: 100 }), enabled: isReminder })
  const managers = (membersQ.data?.data ?? []).filter((m) => (customer.managerIds ?? []).includes(m.id))

  const add = useMutation({
    mutationFn: () => customersApi.addActivity(customerId, {
      type, body: body.trim() || undefined,
      dueAt: isReminder && dueAt ? new Date(dueAt).toISOString() : undefined,
      reminderKind: isReminder ? kind : undefined,
      remindBeforeMin: isReminder ? lead : undefined,
      reminderAssigneeId: isReminder ? (assigneeId || null) : undefined,
      repeat: isReminder ? repeat : undefined,
    }),
    onSuccess: () => { setBody(""); setDueAt(""); setRepeat("NONE"); setAssigneeId(""); setFocused(false); onAdded() },
    onError: (e: Error) => notify.error(e.message || "Could not add"),
  })

  const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

  return (
    <div className={cn("rounded-2xl border bg-card p-2.5 transition-shadow", focused || isReminder ? "border-primary/40 shadow-sm" : "border-border/70")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
          {COMPOSER.map((c) => (
            <button key={c.type} onClick={() => setType(c.type)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                type === c.type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <c.icon className="h-3.5 w-3.5" /> {t(`customers.act.${c.type.toLowerCase()}`, c.label)}
            </button>
          ))}
        </div>
        {customer.spaceId && (
          <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
            <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> {t("customers.newTask", "Task")}
          </Button>
        )}
      </div>
      <Textarea value={body} onFocus={() => setFocused(true)} onChange={(e) => setBody(e.target.value)} rows={focused || body || isReminder ? 3 : 1}
        className="resize-none border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
        placeholder={isReminder ? t("customers.reminderPlaceholder", "What to follow up on…") : t("customers.notePlaceholder", "Write a note…")} />

      {isReminder && (
        <div className="mt-1.5 space-y-2.5 rounded-xl bg-muted/40 p-2.5">
          {/* Reason / channel */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t("customers.reminderReason", "Reason")}</p>
            <div className="inline-flex flex-wrap gap-1">
              {REMINDER_KINDS.map((k) => (
                <button key={k.key} onClick={() => setKind(k.key)}
                  className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    kind === k.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
                  <k.icon className="h-3.5 w-3.5" /> {t(`customers.reminderKind.${k.key.toLowerCase()}`, k.label)}
                </button>
              ))}
            </div>
          </div>
          {/* When + lead + repeat + assignee */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-8 w-[13.5rem] text-xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <select value={lead} onChange={(e) => setLead(Number(e.target.value))} className={selectCls}>
                {LEAD_OPTIONS.map((o) => <option key={o.v} value={o.v}>{t(`customers.lead.${o.v}`, o.label)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className={selectCls}>
                {REPEAT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{t(`customers.repeat.${o.v.toLowerCase()}`, o.label)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={selectCls}>
                <option value="">{t("customers.allManagers", "All managers")}</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{`${m.firstName} ${m.lastName}`.trim()}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {assigneeId
              ? t("customers.reminderWhoOne", "Notifies the selected manager, everywhere.")
              : t("customers.reminderWho", "Notifies every manager assigned to this customer, everywhere.")}
          </p>
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-end gap-2 px-1.5">
        <Button size="sm" disabled={add.isPending || (isReminder ? !dueAt : !body.trim())} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> {isReminder ? t("customers.setReminder", "Set reminder") : t("customers.log", "Add")}</>}
        </Button>
      </div>

      {customer.spaceId && (
        <CreateTaskDialog open={taskOpen} onOpenChange={(o) => { setTaskOpen(o); if (!o) onAdded() }} defaultSpaceId={customer.spaceId} defaultCustomerId={customer.id} />
      )}
    </div>
  )
}

// A one-click "remind me in 3 days" used by the no-next-step nudge.
function QuickRemind({ customerId, onAdded }: { customerId: string; onAdded: () => void }) {
  const { t } = useTranslation()
  const add = useMutation({
    mutationFn: () => {
      const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0)
      return customersApi.addActivity(customerId, { type: "REMINDER", reminderKind: "CALL", dueAt: d.toISOString(), remindBeforeMin: 0 })
    },
    onSuccess: onAdded,
    onError: (e: Error) => notify.error(e.message || "Could not add"),
  })
  return (
    <Button size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate()}>
      {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Bell className="mr-1.5 h-3.5 w-3.5" /> {t("customers.remindIn3", "Remind in 3 days")}</>}
    </Button>
  )
}

// ── Timeline ────────────────────────────────────────────────────────────────
const ACT_META: Record<string, { icon: LucideIcon; tone: string }> = {
  NOTE: { icon: StickyNote, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  CALL: { icon: PhoneCall, tone: "bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300" },
  EMAIL: { icon: Mails, tone: "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300" },
  MEETING: { icon: Users, tone: "bg-cyan-100 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-300" },
  REMINDER: { icon: Clock, tone: "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300" },
  STATUS: { icon: RefreshCw, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" },
  SYSTEM: { icon: Settings2, tone: "bg-muted text-muted-foreground" },
}
function Timeline({ customerId, loading, activities, empty, onChanged }: {
  customerId: string; loading: boolean; activities: FeedItem[]; empty: string; onChanged: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const now = Date.now()
  const toggleDone = useMutation({ mutationFn: ({ actId, done }: { actId: string; done: boolean }) => customersApi.updateActivity(customerId, actId, { done }), onSuccess: onChanged })
  const del = useMutation({ mutationFn: (actId: string) => customersApi.removeActivity(customerId, actId), onSuccess: onChanged })
  const snooze = useMutation({ mutationFn: ({ actId, dueAt }: { actId: string; dueAt: string }) => customersApi.updateActivity(customerId, actId, { dueAt }), onSuccess: onChanged })
  const doSnooze = (a: CustomerActivity, addMin: number) => {
    const base = a.dueAt && new Date(a.dueAt).getTime() > now ? new Date(a.dueAt) : new Date()
    snooze.mutate({ actId: a.id, dueAt: new Date(base.getTime() + addMin * 60000).toISOString() })
  }

  const groups = useMemo(() => {
    const m = new Map<number, FeedItem[]>()
    for (const a of activities) { const k = dayKey(a.createdAt); if (!m.has(k)) m.set(k, []); m.get(k)!.push(a) }
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0])
  }, [activities])

  if (loading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 py-16 text-center">
        <StickyNote className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">
          {empty === "reminders" ? t("customers.noReminders", "No reminders. Add one above to follow up.") : t("customers.noActivity", "No activity yet. Add a note or log a call above.")}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(([k, items]) => (
        <div key={k}>
          <div className="mb-3 flex items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{dayLabel(items[0].createdAt, t)}</p>
            <div className="h-px flex-1 bg-border/60" />
          </div>
          <ol className="relative space-y-1.5 pl-1 before:absolute before:left-[13px] before:top-1 before:bottom-1 before:w-px before:bg-border/60">
            {items.map((a) => {
              /*
                Task rows come first, before any activity-only field is read.

                The feed mixes activities and tasks, and `author`, `overdue`
                and `isSystem` only exist on an activity. Computing them above
                this branch read three fields off task rows that never had
                them — harmless while the row was `any`, and a type error the
                moment the union was written down.
              */
              // Task item (from the customer's task feed) — clickable card.
              if (a.type === "TASK") {
                const tk = a.task
                const done = ["COMPLETED", "CLOSED"].includes(tk.status)
                return (
                  <li key={a.id} className="group relative flex gap-3 py-1">
                    <span className="z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 ring-4 ring-background dark:bg-indigo-950/50 dark:text-indigo-300">
                      <CheckSquare className="h-3.5 w-3.5" />
                    </span>
                    <button onClick={() => router.push(`/tasks/${tk.id}`)}
                      className="min-w-0 flex-1 rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-left shadow-sm transition-colors hover:border-primary/40">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{t("customers.task", "Task")}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>{tk.status}</span>
                        <span className="text-muted-foreground/40">·</span><span className="shrink-0">{relTime(a.createdAt)}</span>
                        <ChevronDownIcon className="ml-auto h-3.5 w-3.5 -rotate-90 text-muted-foreground" />
                      </div>
                      <p className={cn("mt-1 truncate text-sm font-medium text-foreground", done && "line-through opacity-70")}>{tk.title}</p>
                      {tk.dueDate && <p className="mt-0.5 text-xs text-muted-foreground">{t("customers.dueAt", "Due {{date}}", { date: fmtDate(tk.dueDate) })}</p>}
                    </button>
                  </li>
                )
              }
              const meta = ACT_META[a.type] ?? ACT_META.NOTE
              const Icon = meta.icon
              const overdue = a.type === "REMINDER" && a.dueAt && !a.doneAt && new Date(a.dueAt).getTime() < now
              const author = a.author ? `${a.author.firstName} ${a.author.lastName ?? ""}`.trim() : t("customers.system", "System")
              const isSystem = a.type === "STATUS" || a.type === "SYSTEM"


              // System events (stage changes, invites) = subtle inline lines, no card.
              if (isSystem) {
                return (
                  <li key={a.id} className="group relative flex items-center gap-3 py-0.5">
                    <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-4 ring-background">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">
                        {a.type === "STATUS"
                          ? <>{t("customers.movedTo", "moved to")} <span className="font-semibold text-foreground">{customerStageLabel(a.metadata?.to || "")}</span></>
                          : (a.body || t("customers.act.system", "System"))}
                      </span>
                      <span className="text-muted-foreground/40">·</span><span className="truncate">{author}</span>
                      <span className="text-muted-foreground/40">·</span><span className="shrink-0">{relTime(a.createdAt)}</span>
                      <button onClick={() => del.mutate(a.id)} className="ml-auto shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
                    </p>
                  </li>
                )
              }

              // Content activities (note / call / email / meeting / reminder) = cards.
              return (
                <li key={a.id} className="group relative flex gap-3 py-1">
                  <span className={cn("z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-background",
                    a.type === "REMINDER" && a.doneAt ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50" :
                    overdue ? "bg-red-100 text-red-600 dark:bg-red-950/50" : meta.tone)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-card px-3.5 py-2.5 shadow-sm transition-colors hover:border-border">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {a.type === "REMINDER"
                          ? `${t("customers.act.reminder", "Reminder")} · ${(REMINDER_KIND_META[(a.reminderKind || "OTHER").toUpperCase()] ?? REMINDER_KIND_META.OTHER).label}`
                          : t(`customers.act.${String(a.type).toLowerCase()}`, String(a.type))}
                      </span>
                      <span className="text-muted-foreground/40">·</span><span className="truncate">{author}</span>
                      <span className="text-muted-foreground/40">·</span><span className="shrink-0">{relTime(a.createdAt)}</span>
                      <button onClick={() => del.mutate(a.id)} className="ml-auto shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {a.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{a.body}</p>}
                    {a.type === "REMINDER" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                          <Checkbox checked={!!a.doneAt} onCheckedChange={(v) => toggleDone.mutate({ actId: a.id, done: !!v })} />
                          <span className={cn("text-xs font-medium", a.doneAt ? "text-emerald-600 line-through" : overdue ? "text-red-600" : "text-amber-600")}>
                            {a.doneAt ? t("customers.done", "Done") : t("customers.dueAt", "Due {{date}}", { date: fmtDateTime(a.dueAt) })}
                          </span>
                          {!a.doneAt && leadLabel(a.remindBeforeMin) && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Bell className="h-3 w-3" /> {leadLabel(a.remindBeforeMin)}</span>
                          )}
                          {a.repeat && a.repeat !== "NONE" && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Repeat className="h-3 w-3" /> {t(`customers.repeat.${String(a.repeat).toLowerCase()}`, String(a.repeat))}</span>
                          )}
                        </label>
                        {!a.doneAt && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <span>{t("customers.snooze", "Snooze")}:</span>
                            <button onClick={() => doSnooze(a, 60)} className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted">1h</button>
                            <button onClick={() => doSnooze(a, 1440)} className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted">{t("customers.snoozeDay", "1d")}</button>
                            <button onClick={() => doSnooze(a, 10080)} className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted">{t("customers.snoozeWeek", "1w")}</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}

// ── Invite card ──────────────────────────────────────────────────────────────
function InviteCard({ customer, hasB2C, onChanged }: { customer: Customer; hasB2C: boolean; onChanged: () => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const invite = useMutation({
    mutationFn: (portalId?: string) => customersApi.invite(customer.id, portalId ? { portalId } : undefined),
    onSuccess: (res) => { setCode(res.code ?? null); setPickerOpen(false); notify.success(t("customers.invited", "Invite sent")); onChanged() },
    onError: (e: Error) => notify.error(e.message || "Could not invite"),
  })
  const copy = () => { if (code) { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } }

  // The portal decides the client's entity AND their categories. Fetch this
  // space's portals so we can auto-bind (one portal) or let the office choose
  // (several). Only relevant while inviting a not-yet-bound customer.
  const portalsQ = useQuery({
    queryKey: ["space-portals", customer.spaceId],
    queryFn: () => spacePortalApi.listPortals(customer.spaceId!),
    enabled: hasB2C && !!customer.spaceId && !customer.isPortalResident,
  })
  const portals = portalsQ.data ?? []
  // Need a choice only when the space runs >1 portal AND the customer isn't
  // already bound to one (an assigned unit/portal decides it on the backend).
  const needsPortalChoice = portals.length > 1 && !customer.portalId
  const onInviteClick = () => (needsPortalChoice ? setPickerOpen(true) : invite.mutate(undefined))

  return (
    <div className={cn("rounded-2xl border p-4",
      customer.isPortalResident ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20" : "border-border/70 bg-card")}>
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Smartphone className="h-3.5 w-3.5" /> {t("customers.appAccessTitle", "App access")}
      </p>
      {/* A freshly generated code wins over the "has app" state so the office
          can actually copy/share it right after inviting. */}
      {code ? (
        <div className="space-y-2 text-center">
          <button onClick={copy} className="mx-auto flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 font-mono text-lg font-semibold tracking-widest">
            {code} {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
          <p className="text-xs text-muted-foreground">{t("customers.inviteShare", "Share this code (or the emailed link) so they can sign in.")}</p>
        </div>
      ) : customer.app?.accepted ? (
        // Accepted — a real login exists. Show it + which entity they use.
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> {t("customers.appActive", "Active — signed in to the app")}</p>
          {customer.app?.entityLabel && (
            <p className="text-xs text-muted-foreground">{t("customers.appEntity", "Access: {{entity}}{{portal}}", { entity: customer.app.entityLabel, portal: customer.app.portalName ? ` · ${customer.app.portalName}` : "" })}</p>
          )}
        </div>
      ) : customer.isPortalResident ? (
        // Invited but not yet accepted — waiting for them to sign up.
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400"><Send className="h-3.5 w-3.5" /> {t("customers.appInvited", "Invited — waiting for them to sign up.")}</p>
          {customer.app?.entityLabel && (
            <p className="text-xs text-muted-foreground">{t("customers.appEntity", "Access: {{entity}}{{portal}}", { entity: customer.app.entityLabel, portal: customer.app.portalName ? ` · ${customer.app.portalName}` : "" })}</p>
          )}
          <Button variant="outline" size="sm" className="w-full" disabled={invite.isPending} onClick={() => invite.mutate(undefined)}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> {invite.isPending ? t("common.saving", "Working…") : t("customers.resendCode", "Resend invite code")}
          </Button>
        </div>
      ) : hasB2C ? (
        <>
          <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{t("customers.inviteIntro", "Give this customer a login to order & follow their jobs.")}</p>
          <Button className="w-full" disabled={invite.isPending} onClick={onInviteClick}>
            <Send className="mr-1.5 h-4 w-4" /> {invite.isPending ? t("common.saving", "Working…") : t("customers.invite", "Invite to app")}
          </Button>

          {/* Portal picker — only when the space runs several portals. The chosen
              portal decides the client's entity + which categories they see. */}
          <Dialog open={pickerOpen} onOpenChange={(o) => { if (!invite.isPending) setPickerOpen(o) }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("customers.pickPortalTitle", "Which portal should they use?")}</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">{t("customers.pickPortalHint", "This space runs several portals. The one you pick decides the client's entity and the categories they can report.")}</p>
              <div className="mt-1 space-y-1.5">
                {portals.map((p: PortalSummary) => (
                  <button key={p.id} type="button" disabled={invite.isPending} onClick={() => invite.mutate(p.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-muted/50 disabled:opacity-60">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t("customers.pickPortalMeta", "{{entity}} · {{count}} categories", { entity: p.entityLabel, count: p.categoryCount })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <Button className="w-full" disabled><Send className="mr-1.5 h-4 w-4" /> {t("customers.invite", "Invite to app")}</Button>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">🔒 {t("customers.needB2C", "Turn on the B2C Portal module (workspace Modules tab) to invite customers.")}</p>
        </>
      )}
    </div>
  )
}
