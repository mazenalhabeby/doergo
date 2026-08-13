"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Mail, Phone, MapPin, Contact as ContactIcon, Send, Copy, Check, Trash2,
  StickyNote, PhoneCall, Mails, Users, Clock, RefreshCw, Settings2, Loader2,
} from "lucide-react"

import { customersApi, locationsApi, type CustomerActivity } from "@/lib/api"
import { CUSTOMER_STAGES, customerStageLabel } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CustomerForm } from "../../locations/[id]/_components/customers-tab"

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "")
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : "")

const COMPOSER = [
  { type: "NOTE", label: "Note", icon: StickyNote },
  { type: "CALL", label: "Log call", icon: PhoneCall },
  { type: "EMAIL", label: "Log email", icon: Mails },
  { type: "MEETING", label: "Meeting", icon: Users },
  { type: "REMINDER", label: "Reminder", icon: Clock },
] as const

const stageTone: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  gray: "bg-muted text-muted-foreground",
}

export default function CustomerRecordPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const qc = useQueryClient()

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
    return <div className="mx-auto max-w-5xl p-6"><Skeleton className="h-40 w-full rounded-xl" /></div>
  }
  if (!customer) {
    return <div className="mx-auto max-w-5xl p-6 text-center text-muted-foreground">{t("customers.notFound", "Customer not found")}</div>
  }

  const stage = CUSTOMER_STAGES.find((s) => s.key === (customer.status || "LEAD"))

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Back */}
      <button onClick={() => (customer.spaceId ? router.push(`/locations/${customer.spaceId}`) : router.back())}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {spaceQ.data?.name ?? t("customers.title", "Customers")}
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-lg font-semibold text-muted-foreground">{initials(customer.name)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-foreground">{customer.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            {customer.isPortalResident
              ? <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Send className="h-3 w-3" /> {t("customers.appAccess", "App access")}</Badge>
              : <Badge variant="secondary">{t("customers.crmTag", "CRM")}</Badge>}
            {customer.contactName && <span className="text-sm text-muted-foreground">{customer.contactName}</span>}
          </div>
        </div>
        {/* Stage */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("customers.stage", "Stage")}</span>
          <Select value={customer.status || "LEAD"} onValueChange={(v) => setStatus.mutate(v)}>
            <SelectTrigger className={cn("h-8 w-36 border-0 font-medium", stageTone[stage?.tone ?? "slate"])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOMER_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <CustomerForm existing={customer} onSaved={refresh} trigger={<Button variant="outline" size="sm">{t("common.edit", "Edit")}</Button>} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Timeline */}
        <div>
          <Composer customerId={id} onAdded={refresh} />
          <Timeline
            customerId={id}
            loading={activityQ.isLoading}
            activities={activityQ.data ?? []}
            onChanged={refresh}
          />
        </div>

        {/* Rail */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("customers.details", "Details")}</p>
            <dl className="space-y-2 text-sm">
              <RailRow icon={Mail} value={customer.email} />
              <RailRow icon={Phone} value={customer.phone} />
              <RailRow icon={MapPin} value={customer.address} />
              <RailRow icon={ContactIcon} value={customer.contactName} />
            </dl>
            {customer.notes && <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{customer.notes}</p>}
          </div>

          <InviteCard customer={customer} hasB2C={hasB2C} onChanged={refresh} />
        </div>
      </div>
    </div>
  )
}

function RailRow({ icon: Icon, value }: { icon: any; value?: string | null }) {
  if (!value) return null
  return <div className="flex items-center gap-2 text-foreground"><Icon className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{value}</span></div>
}

// ── Composer ────────────────────────────────────────────────────────────────
function Composer({ customerId, onAdded }: { customerId: string; onAdded: () => void }) {
  const { t } = useTranslation()
  const [type, setType] = useState<string>("NOTE")
  const [body, setBody] = useState("")
  const [dueAt, setDueAt] = useState("")

  const add = useMutation({
    mutationFn: () => customersApi.addActivity(customerId, { type, body: body.trim() || undefined, dueAt: type === "REMINDER" && dueAt ? new Date(dueAt).toISOString() : undefined }),
    onSuccess: () => { setBody(""); setDueAt(""); onAdded() },
    onError: (e: any) => notify.error(e.message || "Could not add"),
  })

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {COMPOSER.map((c) => (
          <button key={c.type} onClick={() => setType(c.type)}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              type === c.type ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
            <c.icon className="h-3.5 w-3.5" /> {t(`customers.act.${c.type.toLowerCase()}`, c.label)}
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
        placeholder={type === "REMINDER" ? t("customers.reminderPlaceholder", "What to follow up on…") : t("customers.notePlaceholder", "Write a note…")} />
      <div className="mt-2 flex items-center justify-between gap-2">
        {type === "REMINDER" ? (
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-8 w-56 text-xs" />
        ) : <span />}
        <Button size="sm" disabled={add.isPending || (!body.trim() && type !== "REMINDER")} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("customers.log", "Add")}
        </Button>
      </div>
    </div>
  )
}

// ── Timeline ────────────────────────────────────────────────────────────────
const ACT_ICON: Record<string, any> = { NOTE: StickyNote, CALL: PhoneCall, EMAIL: Mails, MEETING: Users, REMINDER: Clock, STATUS: RefreshCw, SYSTEM: Settings2 }

function Timeline({ customerId, loading, activities, onChanged }: {
  customerId: string; loading: boolean; activities: CustomerActivity[]; onChanged: () => void
}) {
  const { t } = useTranslation()
  const now = Date.now()
  const openReminders = useMemo(() => activities.filter((a) => a.type === "REMINDER" && !a.doneAt), [activities])

  const toggleDone = useMutation({
    mutationFn: ({ actId, done }: { actId: string; done: boolean }) => customersApi.updateActivity(customerId, actId, { done }),
    onSuccess: onChanged,
  })
  const del = useMutation({
    mutationFn: (actId: string) => customersApi.removeActivity(customerId, actId),
    onSuccess: onChanged,
  })

  if (loading) return <div className="mt-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>

  return (
    <div className="mt-4">
      {openReminders.length > 0 && (
        <p className="mb-2 text-xs font-medium text-amber-600 dark:text-amber-500">
          ⏰ {t("customers.openReminders", "{{count}} open reminder", { count: openReminders.length })}
        </p>
      )}
      {activities.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("customers.noActivity", "No activity yet. Add a note or log a call above.")}</p>
      ) : (
        <ol className="space-y-3">
          {activities.map((a) => {
            const Icon = ACT_ICON[a.type] ?? StickyNote
            const overdue = a.type === "REMINDER" && a.dueAt && !a.doneAt && new Date(a.dueAt).getTime() < now
            const author = a.author ? `${a.author.firstName} ${a.author.lastName ?? ""}`.trim() : t("customers.system", "System")
            return (
              <li key={a.id} className="group flex gap-3">
                <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  a.type === "REMINDER" ? (a.doneAt ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50" : overdue ? "bg-red-100 text-red-600 dark:bg-red-950/50" : "bg-amber-100 text-amber-600 dark:bg-amber-950/50")
                    : "bg-muted text-muted-foreground")}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {a.type === "STATUS"
                        ? t("customers.stageChanged", "Stage: {{from}} → {{to}}", { from: customerStageLabel(a.metadata?.from || ""), to: customerStageLabel(a.metadata?.to || "") })
                        : t(`customers.act.${a.type.toLowerCase()}`, a.type)}
                    </span>
                    <span>·</span><span>{author}</span><span>·</span><span>{fmt(a.createdAt)}</span>
                    <button onClick={() => del.mutate(a.id)} className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{a.body}</p>}
                  {a.type === "REMINDER" && (
                    <div className="mt-2 flex items-center gap-2">
                      <Checkbox checked={!!a.doneAt} onCheckedChange={(v) => toggleDone.mutate({ actId: a.id, done: !!v })} />
                      <span className={cn("text-xs font-medium", a.doneAt ? "text-emerald-600 line-through" : overdue ? "text-red-600" : "text-amber-600")}>
                        {a.doneAt ? t("customers.done", "Done") : t("customers.due", "Due {{date}}", { date: fmtDate(a.dueAt) })}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// ── Invite card ──────────────────────────────────────────────────────────────
function InviteCard({ customer, hasB2C, onChanged }: { customer: any; hasB2C: boolean; onChanged: () => void }) {
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
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("customers.appAccessTitle", "App access")}</p>
      {customer.isPortalResident ? (
        <p className="text-sm text-muted-foreground">✓ {t("customers.hasApp", "This customer logs in to order & follow.")}</p>
      ) : code ? (
        <div className="space-y-2 text-center">
          <button onClick={copy} className="mx-auto flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 font-mono text-lg tracking-wider">
            {code} {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
          <p className="text-xs text-muted-foreground">{t("customers.inviteShare", "Share this code (or the emailed link) so they can sign in.")}</p>
        </div>
      ) : hasB2C ? (
        <Button className="w-full" disabled={invite.isPending} onClick={() => invite.mutate()}>
          <Send className="mr-1.5 h-4 w-4" /> {invite.isPending ? t("common.saving", "Working…") : t("customers.invite", "Invite to app")}
        </Button>
      ) : (
        <>
          <Button className="w-full" disabled><Send className="mr-1.5 h-4 w-4" /> {t("customers.invite", "Invite to app")}</Button>
          <p className="mt-2 text-xs text-muted-foreground">🔒 {t("customers.needB2C", "Turn on the B2C Portal module (space Modules tab) to invite customers.")}</p>
        </>
      )}
    </div>
  )
}
