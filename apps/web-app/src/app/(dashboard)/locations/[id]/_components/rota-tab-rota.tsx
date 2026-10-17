"use client"

import { addDays, format, startOfWeek } from "date-fns"
import {
  AlertTriangle,
  Plus,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  User,
  Users,
} from "lucide-react"
import { UserAvatar } from "@/components/user-avatar"
import { personName } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { EmptyState } from "./section-header"
import { cellHasConflict, WEEKDAY_KEYS } from "./use-rota-tab"
import { RECURRENCE_BADGE } from "./rota-tab-helpers"
import type { RotaTabState } from "./use-rota-tab"

/** Part of RotaTab's markup, moved here unchanged; it reads the page's state from `vm`. */
export function RotaTabRota({ vm }: { vm: RotaTabState }) {
  const {
    isLoading,
    assignments,
    t,
    setEditTarget,
    setDialogOpen,
    setWeekStart,
    days,
    weekConflicts,
    dayStrs,
    todayStr,
    scheduledMembers,
    cellFor,
    openMembers,
    recurrenceSummary,
    setDeleteTarget,
  } = vm
  return (
    <>{isLoading ? (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    ) : !assignments || assignments.length === 0 ? (
      <EmptyState
        icon={CalendarClock}
        title={t("scheduling.rota.empty.title")}
        description={t("scheduling.rota.empty.description")}
        action={
          <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("scheduling.rota.new")}
          </Button>
        }
      />
    ) : (
      <div className="space-y-5">
        {/* Week navigator */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDays(w, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDays(w, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 text-sm font-medium text-foreground">
              {format(days[0], "MMM d")} – {format(days[6], "MMM d")}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            {t("scheduling.rota.grid.thisWeek")}
          </Button>
        </div>

        {/* Conflict summary — overlapping shifts in the visible week */}
        {weekConflicts > 0 && (
          <div
            className={"flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 " +
              "px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800 " +
              "dark:bg-amber-950/40 dark:text-amber-300"}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("scheduling.rota.grid.conflictSummary", { count: weekConflicts })}
          </div>
        )}

        {/* Weekly grid: scheduled members × days */}
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th
                  className={"sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left text-xs font-semibold " +
                    "text-muted-foreground min-w-[140px]"}>
                  {t("scheduling.rota.grid.member")}
                </th>
                {days.map((d, i) => (
                  <th
                    key={dayStrs[i]}
                    className={cn(
                      "px-2 py-2 text-center text-xs font-semibold min-w-[92px]",
                      dayStrs[i] === todayStr ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground",
                    )}
                  >
                    <div>{t(`scheduling.rota.weekdaysShort.${WEEKDAY_KEYS[d.getDay()]}`)}</div>
                    <div className="text-[11px] font-normal">{format(d, "d")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scheduledMembers.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar firstName={m.first} lastName={m.last} seed={m.id} size="sm" />
                      <span className="text-sm font-medium text-foreground truncate">{m.first} {m.last}</span>
                    </div>
                  </td>
                  {days.map((d, i) => {
                    const cell = cellFor(m.id, d, dayStrs[i])
                    const conflict = cellHasConflict(cell)
                    return (
                      <td
                        key={dayStrs[i]}
                        title={conflict ? t("scheduling.rota.grid.conflictCell") : undefined}
                        className={cn(
                          "px-1.5 py-1.5 align-top text-center",
                          dayStrs[i] === todayStr && "bg-blue-50/50 dark:bg-blue-950/20",
                          conflict && "rounded-md ring-1 ring-inset ring-amber-400 dark:ring-amber-600",
                        )}
                      >
                        <div className="flex flex-col items-stretch gap-1">
                          {conflict && (
                            <span
                              className={"inline-flex items-center justify-center gap-1 text-[10px] font-medium " +
                                "text-amber-600 dark:text-amber-400"}>
                              <AlertTriangle className="h-3 w-3" />
                              {t("scheduling.rota.grid.conflictLabel")}
                            </span>
                          )}
                          {cell.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              title={a.shift ? `${a.shift.startLocal}–${a.shift.endLocal}` : undefined}
                              onClick={() => { setEditTarget(a); setDialogOpen(true) }}
                              className={"rounded-md px-1.5 py-1 text-[11px] font-medium leading-tight truncate " +
                                "transition-opacity hover:opacity-80"}
                              style={{
                                backgroundColor: `${a.shift?.color || "#2563eb"}22`,
                                color: a.shift?.color || "#2563eb",
                              }}
                            >
                              {a.shift?.name || t("scheduling.rota.unknownShift")}
                            </button>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Open hours — space members without a shift assigned */}
        {openMembers.length > 0 && (
          <div className="rounded-xl border border-dashed bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">{t("scheduling.rota.grid.openHoursTitle")}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t("scheduling.rota.grid.openHoursHint")}</p>
            <div className="flex flex-wrap gap-2">
              {openMembers.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs">
                  <UserAvatar firstName={m.first} lastName={m.last} seed={m.id} size="sm" />
                  {m.first} {m.last}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Assignments — manage (edit / delete) */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("scheduling.rota.grid.allAssignments")}
          </p>
        {assignments.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center"
                style={{ backgroundColor: `${a.shift?.color || "#2563eb"}20` }}
              >
                <User className="h-4 w-4" style={{ color: a.shift?.color || "#2563eb" }} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {a.user ? personName(a.user) : t("scheduling.rota.unknownMember")}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-sm text-muted-foreground truncate">
                    {a.shift?.name || t("scheduling.rota.unknownShift")}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <Badge variant="outline" className={cn("text-[11px]", RECURRENCE_BADGE[a.recurrence])}>
                    {t(`scheduling.rota.recurrence.${a.recurrence}`)}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">{recurrenceSummary(a)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {a.priority > 0 && (
                <Badge variant="secondary" className="text-[11px]">
                  {t("scheduling.rota.priorityBadge", { value: a.priority })}
                </Badge>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditTarget(a); setDialogOpen(true) }}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-red-600"
                onClick={() => setDeleteTarget(a)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        </div>
      </div>
    )}</>
  )
}
