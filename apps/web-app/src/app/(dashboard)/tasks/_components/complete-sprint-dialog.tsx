"use client"

import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { parseISO } from "date-fns"
import { localDateKey } from "@hbcfield/shared/client"
import { Loader2, CheckCircle2 } from "lucide-react"
import { type Sprint, type Task } from "@/lib/api"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Checkbox } from "@/components/ui/checkbox"

// A labelled date button opening a calendar — the sprint and epic dialogs ask
// for their dates the same way.
export function DateField({
  label,
  value,
  onSelect,
  placeholder,
  disabled,
}: {
  label: string
  value: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder: string
  disabled: boolean
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      {/* The callers hold Dates; the picker speaks `YYYY-MM-DD` — converted here, on local parts. */}
      <DatePicker
        id={id}
        value={value ? localDateKey(value) : ""}
        onChange={(day) => onSelect(day ? parseISO(day) : undefined)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}

// ─── Complete Sprint Dialog ──────────────────────────────────────────────────

export function CompleteSprintDialog({
  open,
  onOpenChange,
  sprint,
  nextSprint,
  incompleteTasks,
  onConfirm,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sprint: Sprint | null
  nextSprint: Sprint | null
  incompleteTasks: Task[]
  onConfirm: (moveToNext: boolean) => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const [moveIncomplete, setMoveIncomplete] = useState(true)

  if (!sprint) return null

  const incompleteCount = incompleteTasks.length

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("tasks.sprint.completeTitle", { name: sprint.name })}
      description={t("tasks.sprint.completeDescription")}
      descriptionClassName="sr-only"
      confirmLabel={
        <>
          {isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <CheckCircle2 className="size-4 mr-1" />}
          {t("tasks.sprint.completeButton")}
        </>
      }
      onConfirm={() => onConfirm(moveIncomplete)}
      confirmClassName="bg-blue-600 hover:bg-blue-700"
      cancelDisabled={isPending}
      confirmDisabled={isPending}
    >
      {incompleteCount > 0 && (
        <div className="flex items-start gap-3 py-2">
          <Checkbox
            id="move-incomplete"
            checked={moveIncomplete}
            onCheckedChange={(checked) => setMoveIncomplete(!!checked)}
          />
          <div className="space-y-0.5">
            <label htmlFor="move-incomplete" className="text-sm font-medium text-foreground cursor-pointer">
              {t("tasks.sprint.moveRemaining", { count: incompleteCount })}
            </label>
            <p className="text-xs text-muted-foreground">
              {nextSprint
                ? t("tasks.sprint.tasksMovedToSprint", { name: nextSprint.name })
                : t("tasks.sprint.tasksMovedToBacklog")}
            </p>
          </div>
        </div>
      )}

      {incompleteCount === 0 && <p className="text-sm text-muted-foreground py-2">{t("tasks.sprint.allComplete")}</p>}
    </ConfirmDialog>
  )
}

// ─── Epic Form Dialog ───────────────────────────────────────────────────────

export const EPIC_COLORS = [
  "#8B5CF6",
  "#2563EB",
  "#DC2626",
  "#16A34A",
  "#CA8A04",
  "#EC4899",
  "#0891B2",
  "#EA580C",
  "#7C3AED",
  "#059669",
]
