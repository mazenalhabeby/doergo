"use client"

import { useTranslation } from "react-i18next"
import { Timer } from "lucide-react"
import { formatDuration } from "@hbcfield/shared/client"
import { useJobTime } from "@/hooks/use-job-time"
import { UserAvatar } from "@/components/user-avatar"

const KINDS = ["travel", "working", "blocked"] as const
const TONE = { travel: "bg-sky-500", working: "bg-green-500", blocked: "bg-amber-500" } as const
const TEXT = { travel: "text-sky-600 dark:text-sky-400", working: "text-green-600 dark:text-green-400", blocked: "text-amber-600 dark:text-amber-400" } as const

/**
 * Job time on the task page (packages/shared/src/tasks/job-time.ts): WORKING
 * time, with travel and blocked apart, counted only inside each person's shift;
 * each person's share; and who started it when it was the office, with why.
 *
 * Read, never stored — and live: the running kind ticks forward between reads
 * while somebody on the job is clocked in. Renders nothing before any time
 * has counted.
 */
export function JobTimeCard({ taskId, paused }: { taskId: string; paused: boolean }) {
  const { t } = useTranslation()
  const { data, time, live } = useJobTime(taskId, paused)
  if (!data || !time || time.travel + time.working + time.blocked === 0) return null
  const sum = time.travel + time.working + time.blocked
  const name = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : "")
  const started = data.startedBy

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Timer className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{t("tasks.jobTime.title")}</span>
        <span className="ml-auto text-xs">
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <span className="size-2 rounded-full bg-green-500 animate-pulse" />
              {t("tasks.jobTime.live")}
            </span>
          ) : paused ? (
            <span className="text-muted-foreground">{t("tasks.jobTime.paused")}</span>
          ) : null}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-foreground">{formatDuration(time.working)}</span>
        <span className="text-sm text-muted-foreground">{t("tasks.jobTime.working")}</span>
      </div>

      <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {KINDS.filter((k) => time[k] > 0).map((k) => (
          <div key={k} className={TONE[k]} style={{ flex: time[k] / sum }} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {KINDS.map((k) => (
          <div key={k}>
            <p className={`text-xs ${TEXT[k]}`}>{t(`tasks.jobTime.${k}`)}</p>
            <p className="font-semibold tabular-nums text-foreground">{formatDuration(time[k])}</p>
          </div>
        ))}
      </div>

      {data.byWorker.length > 1 ? (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {data.byWorker.map((w) => (
            <div key={w.user.id} className="flex items-center gap-2 text-sm">
              <UserAvatar firstName={w.user.firstName} lastName={w.user.lastName} seed={w.user.id} size="xs" />
              <span className="flex-1 truncate text-foreground">{name(w.user)}</span>
              <span className="tabular-nums text-muted-foreground">
                {[formatDuration(w.working), w.travel ? t("tasks.jobTime.travelShort", { time: formatDuration(w.travel) }) : null].filter(Boolean).join(" · ")}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {started?.office ? (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          {[t("tasks.jobTime.startedFor", { name: name(started.user), for: name(started.forUser) }), started.reason ? `“${started.reason}”` : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">{t("tasks.jobTime.onlyInShift")}</p>
    </div>
  )
}
