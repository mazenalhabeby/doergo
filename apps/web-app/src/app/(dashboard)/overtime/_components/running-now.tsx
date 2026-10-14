"use client"

import { useTranslation } from "react-i18next"
import type { OvertimeRunningRound } from "@hbcfield/shared/client"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { clock, mins, STATE_PILL } from "../_lib/round-words"

/**
 * Who is on extra time right now: agreed, and the shift still open. The bar
 * fills toward the agreed end and turns amber once they are past it (that
 * part is not counted).
 */
export function RunningNow({ rounds, now, onOpen }: { rounds: OvertimeRunningRound[]; now: Date; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation()
  if (rounds.length === 0) return null
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">{t("overtimePage.running.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("overtimePage.running.sub")}</p>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        {rounds.map((r) => {
          const start = r.overtimeStartAt ? new Date(r.overtimeStartAt).getTime() : null
          const end = r.overtimeEndAt ? new Date(r.overtimeEndAt).getTime() : null
          const agreed = r.maxDurationMinutes ?? (start != null && end != null ? Math.round((end - start) / 60_000) : 0)
          const spent = start != null ? Math.max(0, Math.round((now.getTime() - start) / 60_000)) : 0
          const over = end != null && now.getTime() > end
          const pct = agreed > 0 ? Math.min(100, Math.round((spent / agreed) * 100)) : 0
          const [first, ...rest] = r.userName.split(" ")
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex flex-col gap-2 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-3">
                <UserAvatar firstName={first} lastName={rest.join(" ")} avatarUrl={r.avatarUrl} seed={r.userId} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{r.userName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.spaceName}
                    {r.cycle > 1 ? ` · ${t("overtimePage.round", { n: r.cycle })}` : ""}
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATE_PILL[over ? "OVER" : "RUNNING"])}>
                  {over ? t("overtimePage.overBy", { minutes: mins(spent - agreed) }) : t("overtimePage.state.RUNNING")}
                </span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className={cn("block h-full rounded-full", over ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${over ? 100 : pct}%` }} />
              </span>
              <span className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>
                  <b className="font-semibold text-foreground">{mins(Math.min(spent, agreed))}</b> {t("overtimePage.ofAgreed", { minutes: mins(agreed) })}
                </span>
                <span>{t(over ? "overtimePage.wasUntil" : "overtimePage.until", { time: clock(r.overtimeEndAt, r.timezone, i18n.language) })}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
