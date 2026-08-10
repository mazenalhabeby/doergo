"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { UserX, Check, RotateCcw, MapPin } from "lucide-react"
import { attendanceApi, type NoShowRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { notify } from "@/lib/toast"
import { useTimeFormat } from "@/hooks/use-time-format"

const STATE_STYLE: Record<string, string> = {
  ESCALATED: "bg-red-500/10 text-red-600 dark:text-red-400",
  REMINDED: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  EXCUSED: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
}

export function NoShowsTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { formatDateTime } = useTimeFormat()

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["attendance-no-shows"],
    queryFn: () => attendanceApi.listNoShows({ days: 14 }),
    refetchInterval: 60_000,
  })

  const resolveM = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "excuse" | "reopen" }) => attendanceApi.resolveNoShow(id, action),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-no-shows"] }) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">{t("attendance.noShows.title", "No-shows")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("attendance.noShows.subtitle", "Scheduled shifts with no clock-in — the worker was reminded, then escalated. Excuse (e.g. approved absence) or reopen.")}
        </p>
      </div>

      {isLoading ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">{t("attendance.noShows.emptyTitle", "No no-shows")}</p>
          <p className="text-xs text-muted-foreground">{t("attendance.noShows.empty", "Everyone scheduled has clocked in.")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((r: NoShowRow) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <UserAvatar firstName={r.userName.split(" ")[0]} lastName={r.userName.split(" ").slice(1).join(" ")} avatarUrl={r.avatarUrl} seed={r.userId} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{r.userName}</p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <MapPin className="size-3" />{r.spaceName}
                  <span className="mx-1 text-border">·</span>
                  {t("attendance.noShows.expected", "Expected")} {formatDateTime(r.expectedClockInAt)}
                </p>
              </div>
              <span className={`text-[11px] font-semibold capitalize rounded-full px-2.5 py-1 shrink-0 ${STATE_STYLE[r.state] ?? ""}`}>
                {r.state.toLowerCase()}
              </span>
              {r.state === "EXCUSED" ? (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={resolveM.isPending} onClick={() => resolveM.mutate({ id: r.id, action: "reopen" })}>
                  <RotateCcw className="size-3.5" />{t("attendance.noShows.reopen", "Reopen")}
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={resolveM.isPending} onClick={() => resolveM.mutate({ id: r.id, action: "excuse" })}>
                  <UserX className="size-3.5" />{t("attendance.noShows.excuse", "Excuse")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
