"use client"

import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Coffee, Check, Clock3, AlarmClock, Loader2 } from "lucide-react"
import { attendanceApi, type BreakPlanRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/**
 * The rests planned for the shift somebody is working right now.
 *
 * Deliberately a panel rather than a modal: a rest is not an interruption to be
 * dismissed, it is part of the day, and the member should be able to see the
 * next one coming without anything popping up in front of them. The prompting is
 * the notification's job; this is where they act.
 */

/** Whole-minute gap as "1h 20m" / "20m", never "0h 20m". */
function hm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export interface RestPanelProps {
  /** The plan frozen onto the open entry at clock-in. */
  plan: BreakPlanRow[]
  /** The rest in progress, if there is one. */
  activeBreak?: { id: string; startedAt: string; ruleId?: string | null } | null
  /** Compact form for the navbar widget. */
  dense?: boolean
  className?: string
}

export function RestPanel({ plan, activeBreak, dense, className }: RestPanelProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  /*
    One tick a minute, for every countdown on the panel at once.

    Not one per row and not one a second: the numbers here are minutes, and a
    timer that fires sixty times more often than the thing it displays changes is
    a battery cost with no reader.
  */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["attendance-status"] })
    void qc.invalidateQueries({ queryKey: ["my-attendance"] })
    void qc.invalidateQueries({ queryKey: ["break-status"] })
  }

  const start = useMutation({
    mutationFn: (ruleId?: string) => attendanceApi.startBreak(ruleId ? { ruleId } : {}),
    onSuccess: () => { refresh(); toast.success(t("attendance.rest.started", "Rest started")) },
    onError: (e: Error) => toast.error(e.message),
  })
  const end = useMutation({
    mutationFn: () => attendanceApi.endBreak(),
    onSuccess: () => { refresh(); toast.success(t("attendance.rest.ended", "Back to work")) },
    onError: (e: Error) => toast.error(e.message),
  })
  const later = useMutation({
    mutationFn: (ruleId?: string) => attendanceApi.snoozeBreak(ruleId ? { ruleId } : {}),
    onSuccess: () => { refresh(); toast.success(t("attendance.rest.postponed", "We'll ask again shortly")) },
    onError: (e: Error) => toast.error(e.message),
  })
  const busy = start.isPending || end.isPending || later.isPending

  // ── On a rest right now ──────────────────────────────────────────────────
  if (activeBreak) {
    const planned = plan.find((i) => i.ruleId === activeBreak.ruleId)
    const elapsed = Math.max(0, Math.round((now - new Date(activeBreak.startedAt).getTime()) / 60_000))
    const target = planned?.durationMinutes ?? null
    const over = target != null && elapsed >= target
    const pct = target ? Math.min(100, (elapsed / target) * 100) : 100

    return (
      <div className={cn("rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900 dark:bg-emerald-950/30", className)}>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          <Coffee className="h-4 w-4" />
          {planned?.name ?? t("attendance.rest.onRest", "On rest")}
        </div>

        <p className="mt-3 font-mono text-3xl font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
          {hm(elapsed)}
        </p>
        <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
          {target
            ? over
              ? t("attendance.rest.overBy", "{{over}} past your {{total}}", { over: hm(elapsed - target), total: hm(target) })
              : t("attendance.rest.ofTotal", "of {{total}}", { total: hm(target) })
            : t("attendance.rest.untimed", "Untimed")}
          {planned && !planned.isPaid ? ` · ${t("attendance.rest.unpaid", "unpaid")}` : ""}
        </p>

        {target != null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-200/70 dark:bg-emerald-900">
            <div
              className={cn("h-full rounded-full transition-all", over ? "bg-amber-500" : "bg-emerald-600")}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        <Button onClick={() => end.mutate()} disabled={busy} className="mt-4 w-full bg-emerald-600 text-white hover:bg-emerald-700">
          {end.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("attendance.rest.backToWork", "Back to work")}
        </Button>
        {/* The honest reason to press it, rather than a nag. */}
        <p className="mt-2 text-[11px] leading-snug text-emerald-700/70 dark:text-emerald-400/70">
          {t("attendance.rest.backHint", "Until you do, the time keeps counting as rest.")}
        </p>
      </div>
    )
  }

  const outstanding = plan
    .filter((i) => i.state === "PENDING" || i.state === "SNOOZED")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const taken = plan.filter((i) => i.state === "TAKEN")
  const missed = plan.filter((i) => i.state === "MISSED")
  if (plan.length === 0) return null

  const next = outstanding[0]
  const dueIn = next ? Math.round((new Date(next.dueAt).getTime() - now) / 60_000) : 0
  const isDue = next && dueIn <= 0

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Coffee className="h-4 w-4" />
          {t("attendance.rest.title", "Rests")}
        </div>
        {taken.length > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {t("attendance.rest.takenCount", "{{done}} of {{total}} taken", { done: taken.length, total: plan.length })}
          </span>
        )}
      </div>

      {next ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{next.name}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                isDue
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {isDue ? t("attendance.rest.dueNow", "Due now") : t("attendance.rest.dueIn", "in {{gap}}", { gap: hm(dueIn) })}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {hm(next.durationMinutes)}
            {" · "}
            {next.isPaid
              ? t("attendance.rest.paidNote", "paid")
              : t("attendance.rest.unpaidNote", "comes off your paid hours")}
            {next.snoozeCount > 0 ? ` · ${t("attendance.rest.postponedTimes", "postponed {{n}}×", { n: next.snoozeCount })}` : ""}
          </p>

          <div className={cn("mt-3 flex gap-2", dense && "flex-col")}>
            <Button
              onClick={() => start.mutate(next.ruleId)}
              disabled={busy}
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
              size={dense ? "sm" : "default"}
            >
              {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coffee className="h-4 w-4" />}
              {t("attendance.rest.startNow", "Start rest")}
            </Button>
            {isDue && (
              <Button
                onClick={() => later.mutate(next.ruleId)}
                disabled={busy}
                variant="outline"
                size={dense ? "sm" : "default"}
                className="flex-1"
              >
                <AlarmClock className="h-4 w-4" />
                {t("attendance.rest.later", "Later")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {missed.length > 0
            ? t("attendance.rest.allDoneWithMissed", "Nothing more due today.")
            : t("attendance.rest.allDone", "All your rests are taken.")}
        </p>
      )}

      {(taken.length > 0 || missed.length > 0) && (
        <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
          {taken.map((i) => (
            <li key={i.ruleId} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                {i.name}
              </span>
              <span className="tabular-nums text-muted-foreground">{hm(i.durationMinutes)}</span>
            </li>
          ))}
          {missed.map((i) => (
            <li key={i.ruleId} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5 text-amber-600" />
                {i.name}
              </span>
              {/*
                Said plainly, and said once. A missed rest is recorded and shown
                to whoever is responsible; it never silently costs the member
                anything, so there is nothing here to argue with.
              */}
              <span className="text-muted-foreground">{t("attendance.rest.notTaken", "not taken")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
