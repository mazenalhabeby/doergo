"use client"

import { Fragment, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Clock } from "lucide-react"
import type { OvertimeRequest } from "@/lib/api"
import { overtimeApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/user-avatar"
import { clock, headline, methodWords, mins, roundOf, STATE_PILL } from "../_lib/round-words"

type Filters = { from: string; to: string; spaceId?: string; technicianId?: string }
const PAGE = 20

/** Every round in the period, newest first, grouped by day — each one a sentence. */
export function RoundsList({ filters, now, selected, onSelect }: { filters: Filters; now: Date; selected: string | null; onSelect: (id: string) => void }) {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [filters.from, filters.to, filters.spaceId, filters.technicianId])

  const { data, isLoading } = useQuery({
    queryKey: keys.overtime.history(filters, page),
    queryFn: () => overtimeApi.getHistory({ ...filters, page, limit: PAGE }),
    refetchInterval: 60_000,
  })
  const rows: OvertimeRequest[] = data?.data ?? []
  const meta = data?.meta
  const dayOf = (r: OvertimeRequest) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "short", timeZone: r.location?.timezone || undefined }).format(new Date(r.createdAt))

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">{t("overtimePage.list.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("overtimePage.list.sub")}</p>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Clock className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("overtimePage.list.empty")}</p>
        </div>
      ) : (
        <div>
          {rows.map((r, i) => {
            const day = dayOf(r)
            const newDay = i === 0 || dayOf(rows[i - 1]!) !== day
            const { state, worked, agreed, overBy } = roundOf(r, now)
            const tz = r.location?.timezone
            const asked = r.technicianRespondedAt ?? r.createdAt
            const how = methodWords(t, r)
            const subBits = [
              t("overtimePage.list.askedAt", { time: clock(asked, tz, i18n.language) }),
              r.technicianReason ? `“${r.technicianReason}”` : null,
              how || null,
              (r.cycle ?? 1) > 1 ? t("overtimePage.round", { n: r.cycle }) : null,
              state === "REFUSED" && r.rejectionReason ? `“${r.rejectionReason}”` : null,
            ].filter(Boolean)
            const [first, ...rest] = (r.technician ? `${r.technician.firstName} ${r.technician.lastName}` : "").split(" ")
            return (
              <Fragment key={r.id}>
                {newDay && <div className="border-t border-border bg-muted/40 px-4 py-1.5 text-xs font-semibold text-muted-foreground first:border-t-0">{day}</div>}
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-t border-border px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    selected === r.id && "bg-primary/5",
                  )}
                >
                  <UserAvatar firstName={first} lastName={rest.join(" ")} avatarUrl={r.technician?.avatarUrl} seed={r.technicianId} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground">{headline(t, r, state, worked, agreed)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground [overflow-wrap:anywhere]">{subBits.join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-foreground">{worked > 0 ? mins(worked) : "—"}</span>
                    {overBy > 0 && <span className="block text-[11px] text-amber-600 dark:text-amber-400">{t("overtimePage.overBy", { minutes: mins(overBy) })}</span>}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATE_PILL[state])}>{t(`overtimePage.state.${state}`)}</span>
                </button>
              </Fragment>
            )
          })}
        </div>
      )}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-border py-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.previous")}</Button>
          <span className="text-sm text-muted-foreground">{t("common.page", { page, totalPages: meta.totalPages })}</span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>{t("common.next")}</Button>
        </div>
      )}
    </section>
  )
}
