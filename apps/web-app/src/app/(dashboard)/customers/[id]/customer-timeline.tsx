"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import {
  Trash2, StickyNote, PhoneCall, Mails, Users, Clock, RefreshCw, Settings2, Bell,
  CheckSquare, Repeat, ChevronDown as ChevronDownIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { customersApi, type CustomerActivity } from "@/lib/api"
import { customerStageLabel, personName } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { ActivityFeedSkeleton } from "@/components/skeletons/crm"
import {
  type FeedItem, REMINDER_KIND_META, dayKey, dayLabel, relTime, fmtDate, fmtDateTime, leadLabel,
} from "./customer-record-lib"

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
export function Timeline({ customerId, loading, activities, empty, onChanged, canWork }: {
  customerId: string; loading: boolean; activities: FeedItem[]; empty: string; onChanged: () => void; canWork: boolean
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

  if (loading) return <ActivityFeedSkeleton />
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
              const author = a.author ? personName(a.author) : t("customers.system", "System")
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
                      <button hidden={!canWork} onClick={() => del.mutate(a.id)} className="ml-auto shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
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
                      <button hidden={!canWork} onClick={() => del.mutate(a.id)} className="ml-auto shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {a.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{a.body}</p>}
                    {a.type === "REMINDER" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                          <Checkbox checked={!!a.doneAt} disabled={!canWork} onCheckedChange={(v) => toggleDone.mutate({ actId: a.id, done: !!v })} />
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
                        {!a.doneAt && canWork && (
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
