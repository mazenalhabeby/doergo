"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, UsersRound } from "lucide-react"

import { cn } from "@/lib/utils"
import { tasksApi } from "@/lib/api"

/** The last 30 days, as `YYYY-MM-DD` from LOCAL parts (never toISOString — it shifts the day). */
function since30(): string {
  const d = new Date(Date.now() - 30 * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Tasks open to a work role, per role, over the last 30 days: open now, overdue
 * (nobody took them by the alert time), average minutes to take, how many were
 * taken, and who takes most (shared tasks/role-pool.ts).
 *
 * Renders NOTHING for an organization that has never opened a task to a role —
 * a panel of zeros is a feature nobody asked about, every day.
 */
export function RoleJobsSummary({ spaceId }: { spaceId: string | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ["role-stats", spaceId],
    queryFn: () => tasksApi.roleStats({ spaceId: spaceId ?? undefined, from: since30() }),
    staleTime: 60_000,
  })
  const roles = data?.roles ?? []
  if (roles.length === 0) return null
  const openNow = roles.reduce((s, r) => s + r.openNow, 0)
  const overdue = roles.reduce((s, r) => s + r.overdue, 0)

  return (
    <div className="mb-4 rounded-xl border border-violet-500/25 bg-violet-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <UsersRound className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <span className="font-medium">{t("tasks.role.summaryTitle")}</span>
        <span className="text-muted-foreground">· {t("tasks.role.openNow", { count: openNow })}</span>
        {overdue > 0 && <span className="font-medium text-amber-700 dark:text-amber-400">· {t("tasks.role.overdue", { count: overdue })}</span>}
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-violet-500/15 px-3 pb-3">
          <table className="mt-2 w-full min-w-[560px] text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">{t("tasks.role.role")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("tasks.role.colOpen")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("tasks.role.colOverdue")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("tasks.role.colTaken")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("tasks.role.colAvg")}</th>
                <th className="py-1.5 pl-2 font-medium">{t("tasks.role.colTopTakers")}</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.roleId} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 font-medium text-foreground">{r.roleName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.openNow}</td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums", r.overdue > 0 && "font-semibold text-amber-700 dark:text-amber-400")}>{r.overdue}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.taken}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.avgMinutesToTake == null ? "—" : t("tasks.role.minutes", { count: r.avgMinutesToTake })}</td>
                  <td className="truncate py-1.5 pl-2 text-muted-foreground">{r.topTakers.map((p) => `${p.name} (${p.count})`).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted-foreground">{t("tasks.role.summaryHint")}</p>
        </div>
      )}
    </div>
  )
}
