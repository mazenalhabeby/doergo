"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns"
import { personName, formatDuration } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { employeesApi, tasksApi } from "@/lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/ui/icon"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { PageHeader, Panel } from "@/components/page/page-kit"
import { cn } from "@/lib/utils"
import { keys } from "@/lib/query-keys"

type PeriodKey = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth"

/** The periods offered — the last whole month is the one payroll is checked against. */
function periodRange(key: PeriodKey, now = new Date()): { from: Date; to: Date } {
  const week = { weekStartsOn: 1 as const }
  switch (key) {
    case "thisWeek":
      return { from: startOfWeek(now, week), to: endOfWeek(now, week) }
    case "lastWeek":
      return { from: startOfWeek(subWeeks(now, 1), week), to: endOfWeek(subWeeks(now, 1), week) }
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case "lastMonth":
      return { from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) }
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
    queryKey: keys.employees.jobTimePicker(),
    queryFn: () => employeesApi.list({ status: "active", limit: 100 }), // the server's own maximum
    enabled: seesOthers,
    staleTime: 5 * 60_000,
  })
  const { data, isLoading } = useQuery({
    queryKey: keys.taskExtras.jobTimeReport(memberId, period),
    queryFn: () =>
      tasksApi.jobTimeReport({ userId: memberId!, from: range.from.toISOString(), to: range.to.toISOString() }),
    enabled: !!memberId,
  })

  const people = members?.data ?? []
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  const warn = "text-shell-warn"
  return (
    <div className={PAGE_SHELL}>
      <Link
        href="/reports"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <Icon name="back" size={16} /> {t("reports.title", "Reports")}
      </Link>
      <PageHeader
        title={t("tasks.jobTime.reportTitle")}
        subtitle={t("tasks.jobTime.reportSubtitle")}
        actions={
          <>
            {seesOthers ? (
              <Select value={memberId ?? undefined} onValueChange={setWho}>
                <SelectTrigger className="h-10 w-56 rounded-xl">
                  <SelectValue placeholder={t("tasks.jobTime.pickMember")} />
                </SelectTrigger>
                <SelectContent>
                  {user ? (
                    <SelectItem value={user.id}>
                      {personName(user)} · {t("tasks.jobTime.you")}
                    </SelectItem>
                  ) : null}
                  {people
                    .filter((p) => p.id !== user?.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {personName(p)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : null}
            <div className="flex flex-wrap gap-1 rounded-full bg-shell-chip p-1">
              {PERIODS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={period === k}
                  onClick={() => setPeriod(k)}
                  className={cn(
                    "h-8 rounded-full px-3.5 text-[13.5px] outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    period === k
                      ? "bg-card font-semibold text-foreground shadow-shell"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`tasks.jobTime.period.${k}`)}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(
            [
              ["working", "text-muted-foreground", data?.totals.working],
              ["travel", "text-shell-accent", data?.totals.travel],
              ["blocked", warn, data?.totals.blocked],
              ["clock", "text-muted-foreground", data?.totals.clock],
            ] as const
          ).map(([k, tone, v]) => (
            <Panel key={k} as="div" className="flex flex-col gap-1 px-[18px] py-4">
              <p className={cn("text-[12.5px] font-medium", tone)}>{t(`tasks.jobTime.total.${k}`)}</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-7 w-20" />
              ) : (
                <p className="text-[26px] font-semibold tracking-[-0.04em] tabular-nums text-foreground">
                  {formatDuration(v ?? 0)}
                </p>
              )}
            </Panel>
          ))}
        </div>

        <Panel className="overflow-x-auto px-2 pb-1.5 pt-1">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="h-[38px] px-3 font-semibold">{t("tasks.jobTime.col.job")}</th>
                <th className="h-[38px] px-3 font-semibold">{t("tasks.jobTime.travel")}</th>
                <th className="h-[38px] px-3 font-semibold">{t("tasks.jobTime.working")}</th>
                <th className="h-[38px] px-3 font-semibold">{t("tasks.jobTime.blocked")}</th>
                <th className="h-[38px] px-3 font-semibold">{t("tasks.jobTime.col.startedBy")}</th>
                <th className="h-[38px] px-3 font-semibold">{t("tasks.jobTime.col.note")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ) : !data?.rows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    {t("tasks.jobTime.empty")}
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.taskId} className="border-t border-border tabular-nums transition-colors hover:bg-accent">
                    <td className="px-3 py-3">
                      <Link
                        href={`/tasks/${r.taskId}`}
                        className="font-semibold text-foreground hover:text-shell-accent"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{r.travel ? formatDuration(r.travel) : "—"}</td>
                    <td className="px-3 py-3 font-semibold text-foreground">{formatDuration(r.working)}</td>
                    <td className={cn("px-3 py-3", r.blocked ? warn : "text-muted-foreground")}>
                      {r.blocked ? formatDuration(r.blocked) : "—"}
                    </td>
                    <td className={cn("px-3 py-3", r.startedBy?.office ? warn : "text-foreground")}>
                      {r.startedBy?.user
                        ? r.startedBy.office
                          ? t("tasks.jobTime.office", { name: r.startedBy.user.firstName })
                          : r.startedBy.user.firstName
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {r.officeReason ? (
                        `“${r.officeReason}”`
                      ) : r.pausedAt ? (
                        <span className={warn}>{t("tasks.jobTime.pausedAt", { time: time(r.pausedAt) })}</span>
                      ) : (
                        (r.blockedReason ?? "—")
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Panel>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("tasks.jobTime.onlyInShiftLong")}</p>
      </div>
    </div>
  )
}
