"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Home, MapPin, UserCheck, User, Smartphone, Mail, Phone, ClipboardList, ChevronRight, Settings2,
  StickyNote, RefreshCw, Plus, Loader2, ListChecks,
} from "lucide-react"

import { spaceUnitsApi, tasksApi, locationsApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { ApartmentDialog } from "../../locations/[id]/_components/apartment-dialog"

const AddressMap = dynamic(() => import("../../customers/[id]/address-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
})

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : "")
function relTime(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
const initials = (a?: string, b?: string) => `${a?.[0] ?? ""}${b?.[0] ?? ""}`.toUpperCase() || "?"
const DONE = ["COMPLETED", "CLOSED"]

export default function ApartmentDetailPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<"activity" | "history">("activity")

  const unitQ = useQuery({ queryKey: ["unit", id], queryFn: () => spaceUnitsApi.get(id) })
  const unit = unitQ.data
  const tasksQ = useQuery({ queryKey: ["unit-tasks", id], queryFn: () => tasksApi.list({ unitId: id, limit: 50 }), enabled: !!unit })
  const actQ = useQuery({ queryKey: ["unit-activities", id], queryFn: () => spaceUnitsApi.activities(id), enabled: !!unit })
  const spaceQ = useQuery({ queryKey: ["location", unit?.spaceId], queryFn: () => locationsApi.getById(unit!.spaceId!), enabled: !!unit?.spaceId })
  const qc = useQueryClient()
  const hasB2C = !!spaceQ.data?.enabledModules?.includes("b2c_portal")
  const refreshUnit = () => { qc.invalidateQueries({ queryKey: ["unit", id] }); qc.invalidateQueries({ queryKey: ["unit-activities", id] }) }

  if (unitQ.isLoading) {
    return <div className="mx-auto max-w-5xl p-6 space-y-4"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-72 w-full rounded-2xl" /></div>
  }
  if (!unit) {
    return <div className="mx-auto max-w-5xl p-6 text-center text-muted-foreground">{t("apartments.notFound", "Apartment not found")}</div>
  }

  const tasks = (tasksQ.data?.data ?? []) as any[]
  const openCount = tasks.filter((tk) => !DONE.includes(tk.status)).length
  const member = unit.residentUser        // staff resident
  const client = unit.customer            // app-access client resident
  const residentName = member ? `${member.firstName} ${member.lastName}`.trim() : client?.name

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <button onClick={() => (unit.spaceId ? router.push(`/locations/${unit.spaceId}`) : router.back())}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {spaceQ.data?.name ?? t("apartments.title", "Apartments")}
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <Home className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{unit.name}</h1>
              {unit.address && unit.address !== unit.name && (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {unit.address}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {residentName ? (
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
                member ? "border-border bg-background text-foreground" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400")}>
                {member ? <User className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />} {residentName}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground">{t("apartments.vacant", "Vacant")}</span>
            )}
            {unit.spaceId && (
              <ApartmentDialog spaceId={unit.spaceId} hasB2C={hasB2C} existing={unit} onSaved={refreshUnit} trigger={
                <Button variant="outline" size="sm"><Settings2 className="mr-1.5 h-3.5 w-3.5" /> {t("common.edit", "Edit")}</Button>
              } />
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* Left: about */}
        <aside className="space-y-4">
          {unit.lat != null && unit.lng != null && (
            <div className="h-40 overflow-hidden rounded-2xl border border-border">
              <AddressMap lat={unit.lat} lng={unit.lng} />
            </div>
          )}

          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <UserCheck className="h-3.5 w-3.5" /> {t("apartments.resident", "Resident")}
            </p>
            {member ? (
              <button onClick={() => router.push(`/members/${member.id}`)} className="flex w-full items-center gap-2 text-left">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{initials(member.firstName, member.lastName)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground hover:text-primary">{residentName}</span>
                  <span className="text-xs text-muted-foreground">{t("apartments.memberTag", "Member (staff)")}</span>
                </span>
              </button>
            ) : client ? (
              <div className="space-y-1.5">
                <button onClick={() => router.push(`/customers/${client.id}`)} className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
                  {client.name} <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Smartphone className="h-2.5 w-2.5" /> {t("customers.appAccess", "App access")}</span>
                </button>
                {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"><Mail className="h-3 w-3" /> {client.email}</a>}
                {client.phone && <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"><Phone className="h-3 w-3" /> {client.phone}</a>}
              </div>
            ) : <p className="text-sm text-muted-foreground">{t("apartments.noResident", "Vacant — no resident assigned.")}</p>}
            {unit.contactName && (
              <p className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                <UserCheck className="h-3 w-3" /> {unit.contactName}{unit.contactPhone ? ` · ${unit.contactPhone}` : ""}
              </p>
            )}
          </div>

          {/* More info — flexible property attributes */}
          {(unit.details ?? []).filter((d) => d.label && d.value).length > 0 && (
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> {t("apartments.moreInfo", "More info")}
              </p>
              <dl className="divide-y divide-border/60 text-sm">
                {(unit.details ?? []).filter((d) => d.label && d.value).map((d, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="shrink-0 text-xs text-muted-foreground">{d.label}</dt>
                    <dd className="truncate text-right font-medium text-foreground">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </aside>

        {/* Main: Activity (what happened to the unit) + History (the tasks) as tabs */}
        <main className="min-w-0 space-y-4">
          <div className="flex items-center gap-1 border-b border-border/70">
            {([
              ["activity", t("apartments.activity", "Activity"), (actQ.data ?? []).length],
              ["history", t("apartments.history", "History"), openCount || null],
            ] as const).map(([key, label, count]) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn("relative -mb-px flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
                  tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {label}
                {count != null && count > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{count}</span>}
                {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          {tab === "activity" ? (
            <section className="space-y-3">
              <NoteComposer unitId={id} onAdded={() => qc.invalidateQueries({ queryKey: ["unit-activities", id] })} />
              <ActivityTimeline loading={actQ.isLoading} activities={actQ.data ?? []} />
            </section>
          ) : (
          <section className="space-y-3">

          {tasksQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 py-16 text-center">
              <ClipboardList className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">{t("apartments.noHistory", "No tasks or requests for this apartment yet.")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((tk) => {
                const done = DONE.includes(tk.status)
                const who = tk.assignedTo || tk.assignees?.[0]?.user || null
                return (
                  <button key={tk.id} onClick={() => router.push(`/tasks/${tk.id}`)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", done ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                      <ClipboardList className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-medium text-foreground", done && "line-through opacity-70")}>{tk.title}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>{tk.status}</span>
                        {tk.dueDate && <><span className="text-muted-foreground/40">·</span>{t("customers.dueAt", "Due {{date}}", { date: fmtDate(tk.dueDate) })}</>}
                        <span className="text-muted-foreground/40">·</span>{relTime(tk.createdAt)}
                      </p>
                    </div>
                    {who && (
                      <span className="hidden items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs text-muted-foreground sm:inline-flex" title={`${who.firstName} ${who.lastName}`.trim()}>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">{initials(who.firstName, who.lastName)}</span>
                        <span className="max-w-[7rem] truncate">{`${who.firstName} ${who.lastName}`.trim()}</span>
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                )
              })}
            </div>
          )}
          </section>
          )}
        </main>
      </div>
    </div>
  )
}

// ── Activity: note composer + timeline ──────────────────────────────────────
function NoteComposer({ unitId, onAdded }: { unitId: string; onAdded: () => void }) {
  const { t } = useTranslation()
  const [body, setBody] = useState("")
  const add = useMutation({
    mutationFn: () => spaceUnitsApi.addNote(unitId, body.trim()),
    onSuccess: () => { setBody(""); onAdded() },
    onError: (e: any) => notify.error(e.message || "Could not add note"),
  })
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-2.5">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
        className="resize-none border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
        placeholder={t("apartments.notePh", "Add a note — inspection, access, incident…")} />
      <div className="flex justify-end px-1.5">
        <Button size="sm" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> {t("apartments.addNote", "Add note")}</>}
        </Button>
      </div>
    </div>
  )
}

function ActivityTimeline({ loading, activities }: { loading: boolean; activities: any[] }) {
  const { t } = useTranslation()
  if (loading) return <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
  if (activities.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">{t("apartments.noActivity", "No activity yet.")}</p>
  return (
    <ol className="relative space-y-1.5 pl-1 before:absolute before:left-[13px] before:top-1 before:bottom-1 before:w-px before:bg-border/60">
      {activities.map((a) => {
        const isNote = a.type === "NOTE"
        const Icon = isNote ? StickyNote : RefreshCw
        const author = a.author ? `${a.author.firstName} ${a.author.lastName ?? ""}`.trim() : t("customers.system", "System")
        if (!isNote) {
          return (
            <li key={a.id} className="relative flex items-center gap-3 py-0.5">
              <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-4 ring-background"><Icon className="h-3.5 w-3.5" /></span>
              <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate text-foreground">{a.body}</span>
                <span className="text-muted-foreground/40">·</span><span className="truncate">{author}</span>
                <span className="text-muted-foreground/40">·</span><span className="shrink-0">{relTime(a.createdAt)}</span>
              </p>
            </li>
          )
        }
        return (
          <li key={a.id} className="relative flex gap-3 py-1">
            <span className="z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 ring-4 ring-background dark:bg-slate-800 dark:text-slate-300"><Icon className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-card px-3.5 py-2.5 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t("apartments.note", "Note")}</span>
                <span className="text-muted-foreground/40">·</span><span className="truncate">{author}</span>
                <span className="text-muted-foreground/40">·</span><span className="shrink-0">{relTime(a.createdAt)}</span>
              </div>
              {a.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{a.body}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
