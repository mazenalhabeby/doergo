"use client"

import { useTranslation } from "react-i18next"
import { Pencil, Trash2, User } from "lucide-react"
import { personName, type ShiftAssignment, ShiftRecurrence } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { RECURRENCE_BADGE, WEEKDAY_KEYS } from "./rota-rules"

/** Every assignment on the rota, with how it repeats, to edit or delete. */
export function RotaAssignmentList({
  assignments,
  onEdit,
  onDelete,
}: {
  assignments: ShiftAssignment[]
  onEdit: (assignment: ShiftAssignment) => void
  onDelete: (assignment: ShiftAssignment) => void
}) {
  const { t } = useTranslation()

  const recurrenceSummary = (a: ShiftAssignment): string => {
    switch (a.recurrence) {
      case ShiftRecurrence.DAILY:
        return t("scheduling.rota.recurrence.dailySummary")
      case ShiftRecurrence.WEEKLY:
        return a.daysOfWeek?.length
          ? a.daysOfWeek
              .slice()
              .sort((x, y) => x - y)
              .map((d) => t(`scheduling.rota.weekdaysShort.${WEEKDAY_KEYS[d]}`))
              .join(", ")
          : t("scheduling.rota.recurrence.weekly")
      case ShiftRecurrence.MONTHLY:
        return a.daysOfMonth?.length
          ? t("scheduling.rota.recurrence.monthlySummary", {
              days: a.daysOfMonth
                .slice()
                .sort((x, y) => x - y)
                .join(", "),
            })
          : t("scheduling.rota.recurrence.monthly")
      case ShiftRecurrence.ONE_OFF:
        return t("scheduling.rota.recurrence.oneOffSummary", { count: a.dates?.length || 0 })
      default:
        return ""
    }
  }

  return (
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
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(a)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-red-600"
              onClick={() => onDelete(a)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
