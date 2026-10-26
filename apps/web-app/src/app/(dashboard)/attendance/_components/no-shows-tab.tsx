"use client"

import { useAuth } from "@/contexts/auth-context"

import Link from "next/link"
import { Fragment, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowRight, Check, ChevronDown, RotateCcw } from "lucide-react"
import type { NoShowDayMark, NoShowPersonSummary } from "@hbcfield/shared/client"
import { attendanceApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/common/user-avatar"
import { notify } from "@/lib/toast"
import { useTimeFormat } from "@/hooks/use-time-format"
import { keys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"

const DAYS = 30

/** One colour per way a planned day ended — the legend below names them. */
const MARK_STYLE: Record<NoShowDayMark, string> = {
  open: "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)] text-shell-crit",
  absent: "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)] text-shell-crit",
  excused: "bg-shell-accent-soft text-shell-accent",
  late: "bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] text-shell-warn",
  worked: "bg-muted text-muted-foreground",
  planned: "bg-muted text-muted-foreground",
}

/**
 * The no-show RECORD, one row per person (shared attendance/no-show.ts).
 *
 * Nothing is decided here: an open no-show is decided in Approvals, where the
 * row's count links. What stays is the history — the last planned days at a
 * glance, how each missed one ended, and Reopen for a leader who changes
 * their mind (it goes back to Approvals).
 */
export function NoShowsTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [openRow, setOpenRow] = useState<string | null>(null)
  // Reopening is a correction — PATCH /attendance/no-shows/:id is "correct hours" (clock review C4).
  const { hasPermission } = useAuth()
  const mayReopen = hasPermission("canReconcileAttendance")

  const { data: people = [], isLoading } = useQuery({
    queryKey: keys.attendance.noShows(),
    queryFn: () => attendanceApi.noShowSummary({ days: DAYS }),
    refetchInterval: 60_000,
  })

  const reopen = useMutation({
    mutationFn: (id: string) => attendanceApi.resolveNoShow(id, "reopen"),
    onSuccess: () => {
      notify.success(t("attendance.noShows.reopened"))
      qc.invalidateQueries({ queryKey: keys.attendance.noShows() })
      qc.invalidateQueries({ queryKey: keys.approvals.all() })
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  return (
    <div className="rounded-[22px] border border-border bg-card shadow-shell">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">{t("attendance.noShows.title", "No-shows")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("attendance.noShows.recordSubtitle", { days: DAYS })}</p>
      </div>

      {isLoading ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>
      ) : people.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-shell-accent-soft text-shell-accent">
            <Check className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">{t("attendance.noShows.emptyTitle", "No no-shows")}</p>
          <p className="text-xs text-muted-foreground">
            {t("attendance.noShows.empty", "Everyone scheduled has clocked in.")}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5">{t("attendance.noShows.col.person")}</th>
                  <th className="px-3 py-2.5">{t("attendance.noShows.col.days")}</th>
                  <th className="px-3 py-2.5 text-right">{t("attendance.noShows.col.absent")}</th>
                  <th className="px-3 py-2.5 text-right">{t("attendance.noShows.col.excused")}</th>
                  <th className="px-3 py-2.5 text-right">{t("attendance.noShows.col.settled")}</th>
                  <th className="px-5 py-2.5 text-right">{t("attendance.noShows.col.open")}</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <Fragment key={p.userId}>
                    <PersonRow
                      person={p}
                      expanded={openRow === p.userId}
                      onToggle={() => setOpenRow(openRow === p.userId ? null : p.userId)}
                    />
                    {openRow === p.userId && (
                      <tr className="border-t border-border/40 bg-muted/30">
                        <td colSpan={6} className="px-5 py-3">
                          <ClosedDays
                            person={p}
                            busy={reopen.isPending}
                            onReopen={mayReopen ? (id) => reopen.mutate(id) : undefined}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Legend />
        </>
      )}
    </div>
  )
}

function PersonRow({
  person: p,
  expanded,
  onToggle,
}: {
  person: NoShowPersonSummary
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const [first, ...rest] = p.userName.split(" ")
  return (
    <tr className="border-t border-border/60 first:border-t-0">
      <td className="px-5 py-3">
        <button type="button" onClick={onToggle} className="flex items-center gap-3 text-left" aria-expanded={expanded}>
          <UserAvatar
            firstName={first}
            lastName={rest.join(" ")}
            avatarUrl={p.avatarUrl}
            seed={p.userId}
            size="sm"
            soft
          />
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{p.userName}</span>
            <span className="block truncate text-xs text-muted-foreground">{p.spaceNames.join(" · ")}</span>
          </span>
          {p.closed.length > 0 && (
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
            />
          )}
        </button>
      </td>
      <td className="px-3 py-3">
        <DayStrip days={p.days} />
      </td>
      <td className="px-3 py-3 text-right">{p.absent || "—"}</td>
      <td className="px-3 py-3 text-right">{p.excused || "—"}</td>
      <td className="px-3 py-3 text-right">{p.settled || "—"}</td>
      <td className="px-5 py-3 text-right">
        {p.open > 0 ? (
          <Link
            href="/approvals?kind=noShow"
            className={
              "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 " +
              "text-xs font-semibold text-primary hover:bg-primary/15"
            }
          >
            {t("attendance.noShows.inApprovals", { count: p.open })}
            <ArrowRight className="size-3" />
          </Link>
        ) : (
          "—"
        )}
      </td>
    </tr>
  )
}

function DayStrip({ days }: { days: NoShowPersonSummary["days"] }) {
  const { t, i18n } = useTranslation()
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "narrow", timeZone: "UTC" })
  const full = new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
  return (
    <div className="flex gap-1">
      {days.map((d) => {
        const date = new Date(`${d.localDate}T12:00:00Z`)
        const label = `${full.format(date)} · ${t(`attendance.noShows.mark.${d.mark}`)}`
        return (
          <span
            key={d.localDate}
            title={label}
            aria-label={label}
            className={cn("grid size-6 place-items-center rounded-md text-[10px] font-semibold", MARK_STYLE[d.mark])}
          >
            {weekday.format(date)}
          </span>
        )
      })}
    </div>
  )
}

function ClosedDays({
  person,
  busy,
  onReopen,
}: {
  person: NoShowPersonSummary
  busy: boolean
  /** Absent for a viewer who cannot correct hours: the record only. */
  onReopen?: (id: string) => void
}) {
  const { t } = useTranslation()
  const { formatDateTime } = useTimeFormat()
  if (person.closed.length === 0)
    return <p className="text-xs text-muted-foreground">{t("attendance.noShows.nothingClosed")}</p>
  return (
    <ul className="divide-y divide-border/40">
      {person.closed.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{formatDateTime(c.expectedClockInAt)}</span>
            {c.spaceName ? ` · ${c.spaceName}` : ""}
            {c.note ? <span className="italic"> · “{c.note}”</span> : null}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              c.state === "ABSENT"
                ? "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)] text-shell-crit"
                : "bg-shell-accent-soft text-shell-accent",
            )}
          >
            {closedLabel(t, c)}
          </span>
          {onReopen && (
            <Button size="sm" variant="outline" className="h-7 gap-1.5" disabled={busy} onClick={() => onReopen(c.id)}>
              <RotateCcw className="size-3.5" />
              {t("attendance.noShows.reopen", "Reopen")}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function closedLabel(
  t: (k: string, o?: Record<string, unknown>) => string,
  c: NoShowPersonSummary["closed"][number],
): string {
  if (c.state === "ABSENT") return t("attendance.noShows.state.absent")
  const why = c.closeReason ? t(`attendance.noShows.reason.${c.closeReason}`, { defaultValue: c.closeReason }) : null
  const head = t(c.closedAutomatically ? "attendance.noShows.state.settled" : "attendance.noShows.state.excused")
  return why ? `${head} · ${why}` : head
}

function Legend() {
  const { t } = useTranslation()
  const marks: NoShowDayMark[] = ["open", "absent", "excused", "late", "worked"]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
      {marks.map((m) => (
        <span key={m} className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded", MARK_STYLE[m])} />
          {t(`attendance.noShows.mark.${m}`)}
        </span>
      ))}
    </div>
  )
}
