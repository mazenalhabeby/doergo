"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Timer } from "lucide-react"
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns"
import { formatDuration } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { employeesApi, tasksApi } from "@/lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type PeriodKey = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth"

/** The periods offered — the last whole month is the one payroll is checked against. */
function periodRange(key: PeriodKey, now = new Date()): { from: Date; to: Date } {
  const week = { weekStartsOn: 1 as const }
  switch (key) {
    case "thisWeek": return { from: startOfWeek(now, week), to: endOfWeek(now, week) }
    case "lastWeek": return { from: startOfWeek(subWeeks(now, 1), week), to: endOfWeek(subWeeks(now, 1), week) }
    case "thisMonth": return { from: startOfMonth(now), to: endOfMonth(now) }
    case "lastMonth": return { from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) }
  }
}

const PERIODS: PeriodKey[] = ["thisWeek", "lastWeek", "thisMonth", "lastMonth"]

/**
 * Job time — one person's jobs over a period (packages/shared/src/tasks/job-time.ts):
 * working, travel and blocked apart, who started each (the office, with why),
 * and the time on the clock beside it. Job time only ever counts inside a
 * shift, so hours billed to a client and hours worked come from the same moments.
 *
 * Your own always; somebody else's for whoever sees every task (the server
 * checks it again).
 */
export default function JobTimeReportPage() {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()
  const seesOthers = user?.role === "ADMIN" || hasPermission("canViewAllTasks")
  const [period, setPeriod] = useState<PeriodKey>("thisWeek")
  const [who, setWho] = useState<string | null>(null)
  const memberId = who ?? user?.id ?? null
  const range = useMemo(() => periodRange(period), [period])

  const { data: members } = useQuery({
    queryKey: ["employees", "job-time-picker"],
    queryFn: () => employeesApi.list({ status: "active", limit: 100 }), // the server's own maximum
    enabled: seesOthers,
    staleTime: 5 * 60_000,
  })
  const { data, isLoading } = useQuery({
    queryKey: ["job-time-report", memberId, period],
    queryFn: () => tasksApi.jobTimeReport({ userId: memberId!, from: range.from.toISOString(), to: range.to.toISOString() }),
    enabled: !!memberId,
  })

  const people = members?.data ?? []
  const name = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : "")
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <div>
          <Link href="/reports" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> {t("reports.title", "Reports")}
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
                <Timer className="size-7 text-muted-foreground" /> {t("tasks.jobTime.reportTitle")}
              </h1>
              <p className="mt-1.5 text-muted-foreground">{t("tasks.jobTime.reportSubtitle")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {seesOthers ? (
                <Select value={memberId ?? undefined} onValueChange={setWho}>
                  <SelectTrigger className="w-56"><SelectValue placeholder={t("tasks.jobTime.pickMember")} /></SelectTrigger>
                  <SelectContent>
                    {user ? <SelectItem value={user.id}>{name(user)} · {t("tasks.jobTime.you")}</SelectItem> : null}
                    {people.filter((p) => p.id !== user?.id).map((p) => <SelectItem key={p.id} value={p.id}>{name(p)}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : null}
              <div className="flex rounded-full border border-border p-0.5">
                {PERIODS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPeriod(k)}
                    className={cn("rounded-full px-3 py-1 text-sm transition-colors", period === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {t(`tasks.jobTime.period.${k}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([
            ["working", "text-foreground", data?.totals.working],
            ["travel", "text-sky-600 dark:text-sky-400", data?.totals.travel],
            ["blocked", "text-amber-600 dark:text-amber-400", data?.totals.blocked],
            ["clock", "text-muted-foreground", data?.totals.clock],
          ] as const).map(([k, tone, v]) => (
            <div key={k} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className={cn("text-xs font-medium uppercase tracking-wide", tone)}>{t(`tasks.jobTime.total.${k}`)}</p>
              {isLoading ? <Skeleton className="mt-2 h-7 w-20" /> : <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatDuration(v ?? 0)}</p>}
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("tasks.jobTime.col.job")}</th>
                <th className="px-4 py-3 font-medium">{t("tasks.jobTime.travel")}</th>
                <th className="px-4 py-3 font-medium">{t("tasks.jobTime.working")}</th>
                <th className="px-4 py-3 font-medium">{t("tasks.jobTime.blocked")}</th>
                <th className="px-4 py-3 font-medium">{t("tasks.jobTime.col.startedBy")}</th>
                <th className="px-4 py-3 font-medium">{t("tasks.jobTime.col.note")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-6"><Skeleton className="h-5 w-full" /></td></tr>
              ) : !data?.rows.length ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{t("tasks.jobTime.empty")}</td></tr>
              ) : data.rows.map((r) => (
                <tr key={r.taskId} className="border-t border-border tabular-nums">
                  <td className="px-4 py-3"><Link href={`/tasks/${r.taskId}`} className="font-medium text-foreground hover:text-primary">{r.title}</Link></td>
                  <td className="px-4 py-3 text-muted-foreground">{r.travel ? formatDuration(r.travel) : "—"}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{formatDuration(r.working)}</td>
                  <td className={cn("px-4 py-3", r.blocked ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{r.blocked ? formatDuration(r.blocked) : "—"}</td>
                  <td className={cn("px-4 py-3", r.startedBy?.office ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                    {r.startedBy?.user ? (r.startedBy.office ? t("tasks.jobTime.office", { name: r.startedBy.user.firstName }) : r.startedBy.user.firstName) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.officeReason
                      ? `“${r.officeReason}”`
                      : r.pausedAt
                        ? <span className="text-amber-600 dark:text-amber-400">{t("tasks.jobTime.pausedAt", { time: time(r.pausedAt) })}</span>
                        : r.blockedReason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("tasks.jobTime.onlyInShiftLong")}</p>
      </div>
    </div>
  )
}
