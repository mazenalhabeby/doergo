"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Mail, Phone, MapPin, Send, Copy, Check, Trash2,
  StickyNote, PhoneCall, Mails, Users, Clock, RefreshCw, Settings2, Loader2,
  Smartphone, CheckCircle2, AlertTriangle, CalendarClock, Plus,
} from "lucide-react"

import { customersApi, locationsApi, type CustomerActivity, type Customer } from "@/lib/api"
import { CUSTOMER_STAGES, customerStageLabel } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { CustomerForm } from "../../locations/[id]/_components/customers-tab"

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
function dayLabel(iso: string, t: any) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - dayKey(iso)) / 86400000
  if (diff === 0) return t("customers.today", "Today")
  if (diff === 1) return t("customers.yesterday", "Yesterday")
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
}
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : "")

const COMPOSER = [
  { type: "NOTE", label: "Note", icon: StickyNote },
  { type: "CALL", label: "Call", icon: PhoneCall },
  { type: "EMAIL", label: "Email", icon: Mails },
  { type: "MEETING", label: "Meeting", icon: Users },
  { type: "REMINDER", label: "Reminder", icon: Clock },
] as const
const STAGE_STEPS = CUSTOMER_STAGES.filter((s) => s.key !== "INACTIVE")

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
  const spaceQ = useQuery({
    queryKey: ["location", customer?.spaceId],
    queryFn: () => locationsApi.getById(customer!.spaceId!),
    enabled: !!customer?.spaceId,
  })
  const hasB2C = !!spaceQ.data?.enabledModules?.includes("b2c_portal")

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customer", id] })
    qc.invalidateQueries({ queryKey: ["customer-activities", id] })
  }
  const setStatus = useMutation({
    mutationFn: (status: string) => customersApi.update(id, { status }),
    onSuccess: refresh,
    onError: (e: any) => notify.error(e.message || "Could not update status"),
  })

  if (customerQ.isLoading) {
    return <div className="mx-auto max-w-6xl p-6 space-y-4"><Skeleton className="h-48 w-full rounded-2xl" /><Skeleton className="h-72 w-full rounded-2xl" /></div>
  }
  if (!customer) {
    return <div className="mx-auto max-w-6xl p-6 text-center text-muted-foreground">{t("customers.notFound", "Customer not found")}</div>
  }

  const activities = activityQ.data ?? []
  const openReminders = activities.filter((a) => a.type === "REMINDER" && !a.doneAt)
  const overdue = openReminders.filter((a) => a.dueAt && new Date(a.dueAt).getTime() < Date.now())
  const status = customer.status || "LEAD"
  const isInactive = status === "INACTIVE"
  const grad = gradientFor(customer.name)

  const filtered = activities.filter((a) =>
    tab === "activity" ? true :
    tab === "reminders" ? a.type === "REMINDER" :
    ["NOTE", "CALL", "EMAIL", "MEETING"].includes(a.type),
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <button onClick={() => (customer.spaceId ? router.push(`/locations/${customer.spaceId}`) : router.back())}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {spaceQ.data?.name ?? t("customers.title", "Customers")}
      </button>

      {/* ── HERO: clean neutral header (no banner) ── */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white shadow-sm", grad)}>
            {initials(customer.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{customer.name}</h1>
              {customer.isPortalResident
                ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}</span>
                : <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{t("customers.crmTag", "CRM")}</span>}
            </div>
            {customer.contactName && customer.contactName !== customer.name && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{customer.contactName}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {customer.phone && <IconBtn icon={Phone} href={`tel:${customer.phone}`} label={t("customers.call", "Call")} />}
            {customer.email && <IconBtn icon={Mail} href={`mailto:${customer.email}`} label={t("customers.email", "Email")} />}
            <CustomerForm existing={customer} onSaved={refresh} trigger={
              <Button variant="outline" size="sm"><Settings2 className="mr-1.5 h-3.5 w-3.5" /> {t("common.edit", "Edit")}</Button>
            } />
          </div>
        </div>

        {/* ── Pipeline chevron bar ── */}
        <div className="mt-5">
          {isInactive ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><AlertTriangle className="h-4 w-4" /> {t("customers.inactive", "Inactive")}</span>
              <Button size="sm" variant="outline" onClick={() => setStatus.mutate("LEAD")}>{t("customers.reactivate", "Reactivate")}</Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <PipelineBar current={status} onSet={(s) => setStatus.mutate(s)} pending={setStatus.isPending} />
              <button onClick={() => setStatus.mutate("INACTIVE")}
                className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive">{t("customers.markInactive", "Mark inactive")}</button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* ── LEFT: About panel ── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Panel>
            <PanelHead>{t("customers.about", "About")}</PanelHead>
            <dl className="divide-y divide-border/60 text-sm">
              <PropRow label={t("customers.email", "Email")} value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
              <PropRow label={t("customers.phone", "Phone")} value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
              <PropRow label={t("customers.contactName", "Contact")} value={customer.contactName} />
              <PropRow label={t("customers.address", "Address")} value={customer.address} />
              <PropRow label={t("customers.added", "Added")} value={fmtDate(customer.createdAt)} />
              <PropRow label={t("customers.stage", "Stage")} value={customerStageLabel(status)} />
            </dl>
            {customer.notes && <p className="mt-3 rounded-lg bg-muted/50 p-3 text-[13px] leading-relaxed text-muted-foreground">{customer.notes}</p>}
          </Panel>

          <InviteCard customer={customer} hasB2C={hasB2C} onChanged={refresh} />
        </aside>

        {/* ── MAIN: composer + tabs + timeline ── */}
        <main className="min-w-0 space-y-4">
          <Composer customerId={id} onAdded={refresh} />

          <div className="flex items-center gap-1 border-b border-border/70">
            {([
              ["activity", t("customers.tabActivity", "Activity"), activities.length],
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

// ── Pipeline chevron bar ──────────────────────────────────────────────────────
function chevronClip(first: boolean, last: boolean) {
  const n = "12px"
  if (first) return `polygon(0 0, calc(100% - ${n}) 0, 100% 50%, calc(100% - ${n}) 100%, 0 100%)`
  if (last) return `polygon(${n} 0, 100% 0, 100% 100%, ${n} 100%, 0 50%)`
  return `polygon(${n} 0, calc(100% - ${n}) 0, 100% 50%, calc(100% - ${n}) 100%, ${n} 100%, 0 50%)`
}
function PipelineBar({ current, onSet, pending }: { current: string; onSet: (s: string) => void; pending: boolean }) {
  const idx = STAGE_STEPS.findIndex((s) => s.key === current)
  return (
    <div className="flex min-w-0 flex-1">
      {STAGE_STEPS.map((s, i) => {
        const done = i < idx, active = i === idx, first = i === 0, last = i === STAGE_STEPS.length - 1
        return (
          <button
            key={s.key}
            disabled={pending}
            onClick={() => onSet(s.key)}
            style={{ clipPath: chevronClip(first, last), marginLeft: first ? 0 : -12 }}
            className={cn(
              "relative flex h-9 min-w-0 flex-1 items-center justify-center px-3 text-xs font-semibold transition-colors",
              active ? "bg-primary text-primary-foreground" :
              done ? "bg-primary/25 text-primary dark:bg-primary/20" :
              "bg-muted text-muted-foreground hover:bg-muted/70",
              pending && "opacity-70",
            )}
          >
            <span className="truncate" style={{ paddingLeft: first ? 0 : 8 }}>{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function IconBtn({ icon: Icon, href, label }: { icon: any; href: string; label: string }) {
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
function Composer({ customerId, onAdded }: { customerId: string; onAdded: () => void }) {
  const { t } = useTranslation()
  const [type, setType] = useState<string>("NOTE")
  const [body, setBody] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [focused, setFocused] = useState(false)

  const add = useMutation({
    mutationFn: () => customersApi.addActivity(customerId, {
      type, body: body.trim() || undefined,
      dueAt: type === "REMINDER" && dueAt ? new Date(dueAt).toISOString() : undefined,
    }),
    onSuccess: () => { setBody(""); setDueAt(""); setFocused(false); onAdded() },
    onError: (e: any) => notify.error(e.message || "Could not add"),
  })

  return (
    <div className={cn("rounded-2xl border bg-card p-2.5 transition-shadow", focused ? "border-primary/40 shadow-sm" : "border-border/70")}>
      <div className="mb-2 inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
        {COMPOSER.map((c) => (
          <button key={c.type} onClick={() => setType(c.type)}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              type === c.type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <c.icon className="h-3.5 w-3.5" /> {t(`customers.act.${c.type.toLowerCase()}`, c.label)}
          </button>
        ))}
      </div>
      <Textarea value={body} onFocus={() => setFocused(true)} onChange={(e) => setBody(e.target.value)} rows={focused || body ? 3 : 1}
        className="resize-none border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
        placeholder={type === "REMINDER" ? t("customers.reminderPlaceholder", "What to follow up on…") : t("customers.notePlaceholder", "Write a note, log a call…")} />
      <div className="mt-1 flex items-center justify-between gap-2 px-1.5">
        {type === "REMINDER" ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-8 w-52 text-xs" />
          </div>
        ) : <span />}
        <Button size="sm" disabled={add.isPending || (!body.trim() && type !== "REMINDER")} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> {t("customers.log", "Add")}</>}
        </Button>
      </div>
    </div>
  )
}

// ── Timeline ────────────────────────────────────────────────────────────────
const ACT_META: Record<string, { icon: any; tone: string }> = {
  NOTE: { icon: StickyNote, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  CALL: { icon: PhoneCall, tone: "bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300" },
  EMAIL: { icon: Mails, tone: "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300" },
  MEETING: { icon: Users, tone: "bg-cyan-100 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-300" },
  REMINDER: { icon: Clock, tone: "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300" },
  STATUS: { icon: RefreshCw, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" },
  SYSTEM: { icon: Settings2, tone: "bg-muted text-muted-foreground" },
}
function Timeline({ customerId, loading, activities, empty, onChanged }: {
  customerId: string; loading: boolean; activities: CustomerActivity[]; empty: string; onChanged: () => void
}) {
  const { t } = useTranslation()
  const now = Date.now()
  const toggleDone = useMutation({ mutationFn: ({ actId, done }: { actId: string; done: boolean }) => customersApi.updateActivity(customerId, actId, { done }), onSuccess: onChanged })
  const del = useMutation({ mutationFn: (actId: string) => customersApi.removeActivity(customerId, actId), onSuccess: onChanged })

  const groups = useMemo(() => {
    const m = new Map<number, CustomerActivity[]>()
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
          <ol className="relative space-y-2.5 pl-1 before:absolute before:left-[15px] before:top-1 before:bottom-1 before:w-px before:bg-border/70">
            {items.map((a) => {
              const meta = ACT_META[a.type] ?? ACT_META.NOTE
              const Icon = meta.icon
              const overdue = a.type === "REMINDER" && a.dueAt && !a.doneAt && new Date(a.dueAt).getTime() < now
              const author = a.author ? `${a.author.firstName} ${a.author.lastName ?? ""}`.trim() : t("customers.system", "System")
              return (
                <li key={a.id} className="group relative flex gap-3">
                  <span className={cn("z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-background",
                    a.type === "REMINDER" && a.doneAt ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50" :
                    overdue ? "bg-red-100 text-red-600 dark:bg-red-950/50" : meta.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 transition-colors hover:border-border">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {a.type === "STATUS"
                          ? t("customers.stageChanged", "Stage: {{from}} → {{to}}", { from: customerStageLabel(a.metadata?.from || ""), to: customerStageLabel(a.metadata?.to || "") })
                          : t(`customers.act.${a.type.toLowerCase()}`, a.type)}
                      </span>
                      <span className="text-muted-foreground/50">·</span><span className="truncate">{author}</span>
                      <span className="text-muted-foreground/50">·</span><span className="shrink-0">{relTime(a.createdAt)}</span>
                      <button onClick={() => del.mutate(a.id)} className="ml-auto shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {a.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{a.body}</p>}
                    {a.type === "REMINDER" && (
                      <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <Checkbox checked={!!a.doneAt} onCheckedChange={(v) => toggleDone.mutate({ actId: a.id, done: !!v })} />
                        <span className={cn("text-xs font-medium", a.doneAt ? "text-emerald-600 line-through" : overdue ? "text-red-600" : "text-amber-600")}>
                          {a.doneAt ? t("customers.done", "Done") : t("customers.due", "Due {{date}}", { date: fmtDate(a.dueAt) })}
                        </span>
                      </label>
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
  const invite = useMutation({
    mutationFn: () => customersApi.invite(customer.id),
    onSuccess: (res) => { setCode(res.code ?? null); notify.success(t("customers.invited", "Invite sent")); onChanged() },
    onError: (e: any) => notify.error(e.message || "Could not invite"),
  })
  const copy = () => { if (code) { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } }

  return (
    <div className={cn("rounded-2xl border p-4",
      customer.isPortalResident ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20" : "border-border/70 bg-card")}>
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Smartphone className="h-3.5 w-3.5" /> {t("customers.appAccessTitle", "App access")}
      </p>
      {customer.isPortalResident ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> {t("customers.hasApp", "This customer logs in to order & follow.")}</p>
      ) : code ? (
        <div className="space-y-2 text-center">
          <button onClick={copy} className="mx-auto flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 font-mono text-lg font-semibold tracking-widest">
            {code} {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
          <p className="text-xs text-muted-foreground">{t("customers.inviteShare", "Share this code (or the emailed link) so they can sign in.")}</p>
        </div>
      ) : hasB2C ? (
        <>
          <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{t("customers.inviteIntro", "Give this customer a login to order & follow their jobs.")}</p>
          <Button className="w-full" disabled={invite.isPending} onClick={() => invite.mutate()}>
            <Send className="mr-1.5 h-4 w-4" /> {invite.isPending ? t("common.saving", "Working…") : t("customers.invite", "Invite to app")}
          </Button>
        </>
      ) : (
        <>
          <Button className="w-full" disabled><Send className="mr-1.5 h-4 w-4" /> {t("customers.invite", "Invite to app")}</Button>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">🔒 {t("customers.needB2C", "Turn on the B2C Portal module (space Modules tab) to invite customers.")}</p>
        </>
      )}
    </div>
  )
}
