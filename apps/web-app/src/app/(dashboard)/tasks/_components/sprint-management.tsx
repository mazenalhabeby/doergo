"use client"

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

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
      queryClient.invalidateQueries({ queryKey: ["sprints"] })
      handleOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; goal?: string; startDate: string; endDate: string }) =>
      sprintsApi.update(sprint!.id, data),
    onSuccess: () => {
      notify.sprint("updated", t("tasks.sprint.updatedDescription"))
      queryClient.invalidateQueries({ queryKey: ["sprints"] })
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
      <DialogContent className="sm:max-w-[440px]">
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
            <div className="space-y-1.5">
              <Label className="text-sm">{t("tasks.sidebar.startDate")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal rounded-lg text-sm",
                      !startDate && "text-muted-foreground",
                    )}
                    disabled={isPending}
                  >
                    <Calendar className="mr-2 size-3.5 text-muted-foreground" />
                    {startDate ? format(startDate, "MMM d, yyyy") : t("tasks.fields.pickDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={startDate} onSelect={handleStartDateChange} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">{t("tasks.fields.endDate")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal rounded-lg text-sm",
                      !endDate && "text-muted-foreground",
                    )}
                    disabled={isPending}
                  >
                    <Calendar className="mr-2 size-3.5 text-muted-foreground" />
                    {endDate ? format(endDate, "MMM d, yyyy") : t("tasks.fields.pickDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("tasks.sprint.completeTitle", { name: sprint.name })}</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            {t("tasks.sprint.completeDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

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

        {incompleteCount === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            {t("tasks.sprint.allComplete")}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(moveIncomplete)}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <CheckCircle2 className="size-4 mr-1" />}
            {t("tasks.sprint.completeButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Epic Form Dialog ───────────────────────────────────────────────────────

const EPIC_COLORS = [
  "#8B5CF6", "#2563EB", "#DC2626", "#16A34A", "#CA8A04",
  "#EC4899", "#0891B2", "#EA580C", "#7C3AED", "#059669",
]

export function EpicFormDialog({
  open,
  onOpenChange,
  epic,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  epic?: Epic | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!epic

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState(EPIC_COLORS[0]!)
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [targetDate, setTargetDate] = useState<Date | undefined>(undefined)

  const handleOpenChange = (v: boolean) => {
    if (v && epic) {
      setName(epic.name)
      setDescription(epic.description ?? "")
      setColor(epic.color ?? EPIC_COLORS[0]!)
      setStartDate(epic.startDate ? new Date(epic.startDate) : undefined)
      setTargetDate(epic.targetDate ? new Date(epic.targetDate) : undefined)
    } else if (v) {
      setName("")
      setDescription("")
      setColor(EPIC_COLORS[Math.floor(Math.random() * EPIC_COLORS.length)]!)
      setStartDate(undefined)
      setTargetDate(undefined)
    }
    onOpenChange(v)
  }

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string; startDate?: string; targetDate?: string }) =>
      epicsApi.create(data),
    onSuccess: () => {
      notify.success(t("tasks.epic.created"))
      queryClient.invalidateQueries({ queryKey: ["epics"] })
      handleOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string; startDate?: string; targetDate?: string }) =>
      epicsApi.update(epic!.id, data),
    onSuccess: () => {
      notify.success(t("tasks.epic.updated"))
      queryClient.invalidateQueries({ queryKey: ["epics"] })
      handleOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const isValid = name.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || isPending) return
    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      startDate: startDate?.toISOString(),
      targetDate: targetDate?.toISOString(),
    }
    if (isEdit) updateMutation.mutate(data)
    else createMutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("tasks.epic.editTitle") : t("tasks.epic.createTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? t("tasks.epic.editDescription") : t("tasks.epic.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="epic-name" className="text-sm">{t("tasks.fields.name")}</Label>
            <Input
              id="epic-name"
              placeholder={t("tasks.epic.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              className="h-9 rounded-lg"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t("tasks.fields.color")}</Label>
            <div className="flex items-center gap-1.5">
              {EPIC_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-6 rounded-full transition-all",
                    color === c ? "ring-2 ring-offset-2 ring-offset-background scale-110" : "hover:scale-105",
                  )}
                  style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="epic-description" className="text-sm">{t("tasks.description.label")}</Label>
            <Textarea
              id="epic-description"
              placeholder={t("tasks.epic.descriptionPlaceholder")}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              className="rounded-lg resize-none text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("tasks.sidebar.startDate")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal rounded-lg text-sm",
                      !startDate && "text-muted-foreground",
                    )}
                    disabled={isPending}
                  >
                    <Calendar className="mr-2 size-3.5 text-muted-foreground" />
                    {startDate ? format(startDate, "MMM d, yyyy") : t("common.optional")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">{t("tasks.epic.targetDate")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal rounded-lg text-sm",
                      !targetDate && "text-muted-foreground",
                    )}
                    disabled={isPending}
                  >
                    <Calendar className="mr-2 size-3.5 text-muted-foreground" />
                    {targetDate ? format(targetDate, "MMM d, yyyy") : t("common.optional")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={targetDate} onSelect={setTargetDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!isValid || isPending} className="bg-blue-600 hover:bg-blue-700">
              {isPending ? (
                <><Loader2 className="mr-1.5 size-3.5 animate-spin" />{t("common.saving")}</>
              ) : isEdit ? t("common.saveChanges") : t("tasks.epic.createTitle")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Sprint Dialog ────────────────────────────────────────────────────

export function DeleteSprintDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("tasks.sprint.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("tasks.sprint.deleteDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700"
            disabled={isPending}
          >
            {isPending && <Loader2 className="size-4 animate-spin mr-1" />}
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
