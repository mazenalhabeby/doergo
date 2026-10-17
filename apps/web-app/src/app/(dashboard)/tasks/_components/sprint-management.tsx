"use client"

import { keys } from "@/lib/query-keys"
import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { format, addWeeks, addDays } from "date-fns"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  CheckCircle2,
  Calendar,
} from "lucide-react"
import { notify } from "@/lib/toast"

import { sprintsApi, epicsApi, type Sprint, type Epic, type Task } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { DateField, EPIC_COLORS } from "./complete-sprint-dialog"
export { EpicFormDialog, DeleteSprintDialog } from "./epic-form-dialog"
export { CompleteSprintDialog } from "./complete-sprint-dialog"

// ─── Date field ──────────────────────────────────────────────────────────────

// ─── Sprint Form Dialog ──────────────────────────────────────────────────────

export function SprintFormDialog({
  open,
  onOpenChange,
  sprint,
  nextSprintNumber,
  lastSprintEndDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sprint?: Sprint | null
  nextSprintNumber: number
  lastSprintEndDate: string | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!sprint

  const [name, setName] = useState(sprint?.name ?? "")
  const [goal, setGoal] = useState(sprint?.goal ?? "")
  const [showGoal, setShowGoal] = useState(!!sprint?.goal)
  const [startDate, setStartDate] = useState<Date | undefined>(
    sprint?.startDate ? new Date(sprint.startDate) : undefined,
  )
  const [endDate, setEndDate] = useState<Date | undefined>(
    sprint?.endDate ? new Date(sprint.endDate) : undefined,
  )

  const handleStartDateChange = useCallback((date: Date | undefined) => {
    setStartDate(date)
    if (date && !isEdit) {
      setEndDate(addDays(addWeeks(date, 2), -1))
    }
  }, [isEdit])

  const handleOpenChange = (v: boolean) => {
    if (v && sprint) {
      setName(sprint.name)
      setGoal(sprint.goal ?? "")
      setShowGoal(!!sprint.goal)
      setStartDate(new Date(sprint.startDate))
      setEndDate(new Date(sprint.endDate))
    } else if (v) {
      setName(t("tasks.sprint.defaultName", { number: nextSprintNumber }))
      setGoal("")
      setShowGoal(false)
      if (lastSprintEndDate) {
        const start = addDays(new Date(lastSprintEndDate), 1)
        setStartDate(start)
        setEndDate(addDays(addWeeks(start, 2), -1))
      } else {
        setStartDate(undefined)
        setEndDate(undefined)
      }
    }
    onOpenChange(v)
  }

  const createMutation = useMutation({
    mutationFn: (data: { name: string; goal?: string; startDate: string; endDate: string }) =>
      sprintsApi.create(data),
    onSuccess: () => {
      notify.sprint("created", t("tasks.sprint.createdDescription"))
      queryClient.invalidateQueries({ queryKey: keys.sprints.lists() })
      handleOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; goal?: string; startDate: string; endDate: string }) =>
      sprintsApi.update(sprint!.id, data),
    onSuccess: () => {
      notify.sprint("updated", t("tasks.sprint.updatedDescription"))
      queryClient.invalidateQueries({ queryKey: keys.sprints.lists() })
      handleOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const isValid = name.trim() && startDate && endDate

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || isPending) return
    const data = {
      name: name.trim(),
      goal: goal.trim() || undefined,
      startDate: startDate!.toISOString(),
      endDate: endDate!.toISOString(),
    }
    if (isEdit) updateMutation.mutate(data)
    else createMutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("tasks.sprint.editTitle") : t("tasks.sprint.createTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? t("tasks.sprint.editDescription") : t("tasks.sprint.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sprint-name" className="text-sm">{t("tasks.fields.name")}</Label>
            <Input
              id="sprint-name"
              placeholder={t("tasks.sprint.defaultName", { number: nextSprintNumber })}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              className="h-9 rounded-lg"
              autoFocus
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DateField
              label={t("tasks.sidebar.startDate")}
              value={startDate}
              onSelect={handleStartDateChange}
              placeholder={t("tasks.fields.pickDate")}
              disabled={isPending}
            />

            <DateField
              label={t("tasks.fields.endDate")}
              value={endDate}
              onSelect={setEndDate}
              placeholder={t("tasks.fields.pickDate")}
              disabled={isPending}
            />
          </div>

          {!showGoal ? (
            <button
              type="button"
              onClick={() => setShowGoal(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("tasks.sprint.addGoal")}
            </button>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="sprint-goal" className="text-sm">{t("tasks.sprint.goal")}</Label>
              <Textarea
                id="sprint-goal"
                placeholder={t("tasks.sprint.goalPlaceholder")}
                rows={2}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={isPending}
                className="rounded-lg resize-none text-sm"
              />
            </div>
          )}

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!isValid || isPending} className="bg-blue-600 hover:bg-blue-700">
              {isPending ? (
                <><Loader2 className="mr-1.5 size-3.5 animate-spin" />{t("common.saving")}</>
              ) : isEdit ? t("common.saveChanges") : t("tasks.sprint.createTitle")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
