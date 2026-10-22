"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { addDays, format, startOfWeek } from "date-fns"
import { AlertTriangle, ChevronLeft, ChevronRight, Users } from "lucide-react"
import type { ShiftAssignment, SpaceMember } from "@hbcfield/shared/client"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { assignmentAppliesOn, cellHasConflict, WEEKDAY_KEYS } from "./rota-rules"

/**
 * The rota as a week: a navigator, how many cells are double-booked, scheduled members × days,
 * and the members who work open hours (on the workspace, on no shift). Clicking a shift edits it.
 */
export function RotaWeekGrid({
  assignments,
  spaceMembers,
  onEdit,
}: {
  assignments: ShiftAssignment[]
  spaceMembers: SpaceMember[] | undefined
  onEdit: (assignment: ShiftAssignment) => void
}) {
  const { t } = useTranslation()
  // Week navigator (weeks start Monday).
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const dayStrs = useMemo(() => days.map((d) => format(d, "yyyy-MM-dd")), [days])
  const todayStr = format(new Date(), "yyyy-MM-dd")

  // Scheduled members = anyone with an assignment (deduped, name-sorted).
  const scheduledMembers = useMemo(() => {
    const map = new Map<string, { id: string; first: string; last: string }>()
    for (const a of assignments ?? []) {
      if (a.user && !map.has(a.userId)) {
        map.set(a.userId, { id: a.userId, first: a.user.firstName, last: a.user.lastName })
      }
    }
    return [...map.values()].sort((x, y) => `${x.first} ${x.last}`.localeCompare(`${y.first} ${y.last}`))
  }, [assignments])

  // Open-hours members = space members not on the rota.
  const openMembers = useMemo(() => {
    const scheduledIds = new Set(scheduledMembers.map((m) => m.id))
    return (spaceMembers ?? [])
      .filter((m) => m.user && !scheduledIds.has(m.userId))
      .map((m) => ({ id: m.userId, first: m.user!.firstName, last: m.user!.lastName }))
      .sort((x, y) => `${x.first} ${x.last}`.localeCompare(`${y.first} ${y.last}`))
  }, [spaceMembers, scheduledMembers])

  // Index assignments by member once, so a cell filters only that member's
  // slice instead of re-scanning the whole array members×7 times per render.
  const byUser = useMemo(() => {
    const map = new Map<string, ShiftAssignment[]>()
    for (const a of assignments ?? []) {
      const arr = map.get(a.userId)
      if (arr) arr.push(a)
      else map.set(a.userId, [a])
    }
    return map
  }, [assignments])

  const cellFor = (userId: string, day: Date, dayStr: string) =>
    (byUser.get(userId) ?? []).filter((a) => assignmentAppliesOn(a, day, dayStr))

  // Count double-booked cells in the visible week (overlapping shift times).
  const weekConflicts = useMemo(() => {
    let n = 0
    for (const m of scheduledMembers) {
      for (let i = 0; i < days.length; i++) {
        if (cellHasConflict(cellFor(m.id, days[i], dayStrs[i]))) n++
      }
    }
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledMembers, days, dayStrs, byUser])

  return (
    <>
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
          className={
            "flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 " +
            "px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800 " +
            "dark:bg-amber-950/40 dark:text-amber-300"
          }
        >
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
                className={
                  "sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left text-xs font-semibold " +
                  "text-muted-foreground min-w-[140px]"
                }
              >
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
                    <span className="text-sm font-medium text-foreground truncate">
                      {m.first} {m.last}
                    </span>
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
                            className={
                              "inline-flex items-center justify-center gap-1 text-[10px] font-medium " +
                              "text-amber-600 dark:text-amber-400"
                            }
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {t("scheduling.rota.grid.conflictLabel")}
                          </span>
                        )}
                        {cell.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            title={a.shift ? `${a.shift.startLocal}–${a.shift.endLocal}` : undefined}
                            onClick={() => onEdit(a)}
                            className={
                              "rounded-md px-1.5 py-1 text-[11px] font-medium leading-tight truncate " +
                              "transition-opacity hover:opacity-80"
                            }
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
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
              >
                <UserAvatar firstName={m.first} lastName={m.last} seed={m.id} size="sm" />
                {m.first} {m.last}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
