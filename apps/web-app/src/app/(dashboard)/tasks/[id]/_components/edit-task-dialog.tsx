"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Calendar as CalendarIcon, Loader2 } from "lucide-react"

import { tasksApi, phasesApi, sprintsApi, workflowsApi, type Task, type Phase, type Sprint, type UpdateTaskInput } from "@/lib/api"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"
import { PrioritySelector } from "@/components/tasks"
import { useSpaceModules } from "@/hooks/use-space-modules"

interface EditTaskDialogProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditTaskDialog({ task, open, onOpenChange }: EditTaskDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || "")
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">(
    (task.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || "MEDIUM"
  )
  const [dueDate, setDueDate] = useState<Date | undefined>(
    task.dueDate ? new Date(task.dueDate) : undefined
  )
  const [locationAddress, setLocationAddress] = useState(task.locationAddress || "")
  const [startDate, setStartDate] = useState<Date | undefined>(
    task.startDate ? new Date(task.startDate) : undefined
  )
  const [estimatedHours, setEstimatedHours] = useState<string>(
    task.estimatedHours != null ? String(task.estimatedHours) : ""
  )
  const [phaseId, setPhaseId] = useState<string>(task.phaseId || "none")
  const [sprintId, setSprintId] = useState<string>(task.sprintId || "none")
  // Flow (task type / workflow) — "none" = simple canonical flow.
  const [workflowId, setWorkflowId] = useState<string>(task.workflowId || "none")

  // Phase & Sprint are agile modules — only relevant when the task's SPACE has
  // them enabled (a property/field space won't; a project/software space will).
  const { hasModule } = useSpaceModules(task.spaceId ?? null)
  const showPhases = hasModule("phases")
  const showSprints = hasModule("sprints")

  // Fetch phases, sprints, and the org's flows (task types)
  const { data: flows } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
    enabled: open,
    staleTime: 60000,
  })
  const { data: phases } = useQuery({
    queryKey: ["phases"],
    queryFn: () => phasesApi.list(),
    enabled: open,
    staleTime: 60000,
  })

  const { data: sprints } = useQuery({
    queryKey: ["sprints"],
    queryFn: () => sprintsApi.list(),
    enabled: open,
    staleTime: 60000,
  })

  // Reset form when task changes or dialog opens
  useEffect(() => {
    if (open) {
      setTitle(task.title)
      setDescription(task.description || "")
      setPriority((task.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || "MEDIUM")
      setDueDate(task.dueDate ? new Date(task.dueDate) : undefined)
      setStartDate(task.startDate ? new Date(task.startDate) : undefined)
      setEstimatedHours(task.estimatedHours != null ? String(task.estimatedHours) : "")
      setLocationAddress(task.locationAddress || "")
      setPhaseId(task.phaseId || "none")
      setSprintId(task.sprintId || "none")
      setWorkflowId(task.workflowId || "none")
    }
  }, [open, task])

  const updateMutation = useMutation({
    mutationFn: (input: UpdateTaskInput) => tasksApi.update(task.id, input),
    onSuccess: () => {
      notify.success(t("tasks.edit.success"))
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ["task", task.id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskTimeline", task.id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message || t("tasks.edit.failed")),
  })

  const isFormValid = title.trim() !== "" && description.trim() !== ""

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid || updateMutation.isPending) return

    const parsedHours = estimatedHours ? parseFloat(estimatedHours) : undefined

    updateMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: dueDate?.toISOString(),
      startDate: startDate?.toISOString(),
      estimatedHours: parsedHours && !isNaN(parsedHours) ? parsedHours : undefined,
      locationAddress: locationAddress.trim() || undefined,
      phaseId: phaseId === "none" ? null : phaseId,
      sprintId: sprintId === "none" ? null : sprintId,
      workflowId: workflowId === "none" ? null : workflowId,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("tasks.edit.title")}</DialogTitle>
          <DialogDescription>
            {t("tasks.edit.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-sm font-medium text-foreground">
              {t("tasks.columns.title")}<span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-title"
              placeholder={t("tasks.edit.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={updateMutation.isPending}
              className="h-10 rounded-lg border-border bg-card"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-sm font-medium text-foreground">
              {t("tasks.description.label")}<span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="edit-description"
              placeholder={t("tasks.edit.descriptionPlaceholder")}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={updateMutation.isPending}
              className="rounded-lg border-border bg-card resize-none"
            />
          </div>

          {/* Location & Due Date */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-location" className="text-sm font-medium text-foreground">
                {t("tasks.create.serviceLocationLabel")}
              </Label>
              <Input
                id="edit-location"
                placeholder={t("tasks.fields.addressPlaceholder")}
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                disabled={updateMutation.isPending}
                className="h-10 rounded-lg border-border bg-card"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                {t("tasks.sidebar.dueDate")}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 w-full justify-start text-left font-normal rounded-lg border-border bg-card hover:bg-accent",
                      !dueDate && "text-muted-foreground"
                    )}
                    disabled={updateMutation.isPending}
                  >
                    <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                    {dueDate ? format(dueDate, "MMM d, yyyy") : t("tasks.create.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Start Date & Estimated Hours */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                {t("tasks.sidebar.startDate")}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 w-full justify-start text-left font-normal rounded-lg border-border bg-card hover:bg-accent",
                      !startDate && "text-muted-foreground"
                    )}
                    disabled={updateMutation.isPending}
                  >
                    <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                    {startDate ? format(startDate, "MMM d, yyyy") : t("tasks.create.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-estimated-hours" className="text-sm font-medium text-foreground">
                {t("tasks.sidebar.estimatedHours")}
              </Label>
              <Input
                id="edit-estimated-hours"
                type="number"
                min="0"
                step="0.5"
                placeholder={t("tasks.fields.estimatedHoursPlaceholder")}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                disabled={updateMutation.isPending}
                className="h-10 rounded-lg border-border bg-card"
              />
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">{t("tasks.list.priority")}</Label>
            <PrioritySelector
              value={priority}
              onChange={setPriority}
              disabled={updateMutation.isPending}
            />
          </div>

          {/* Flow (task type / workflow) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">{t("tasks.edit.flow", "Flow")}</Label>
            <Select value={workflowId} onValueChange={setWorkflowId} disabled={updateMutation.isPending}>
              <SelectTrigger className="h-10 rounded-lg border-border bg-card">
                <SelectValue placeholder={t("tasks.edit.flowSimple", "Simple flow")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("tasks.edit.flowSimple", "Simple flow")}</SelectItem>
                {(flows || []).map((wf) => (
                  <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("tasks.edit.flowHint", "Changing the flow updates the task's stages. Its status moves to the new flow's first stage if the current one doesn't exist there.")}</p>
          </div>

          {/* Phase & Sprint — only for spaces with the agile modules enabled */}
          {(showPhases || showSprints) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {showPhases && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("tasks.sidebar.phase")}</Label>
              <Select value={phaseId} onValueChange={setPhaseId} disabled={updateMutation.isPending}>
                <SelectTrigger className="h-10 rounded-lg border-border bg-card">
                  <SelectValue placeholder={t("tasks.sidebar.noPhase")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tasks.sidebar.noPhase")}</SelectItem>
                  {(phases || []).map((phase: Phase) => (
                    <SelectItem key={phase.id} value={phase.id}>
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                        {phase.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

            {showSprints && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("tasks.sidebar.sprint")}</Label>
              <Select value={sprintId} onValueChange={setSprintId} disabled={updateMutation.isPending}>
                <SelectTrigger className="h-10 rounded-lg border-border bg-card">
                  <SelectValue placeholder={t("tasks.sidebar.noSprint")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tasks.sidebar.noSprint")}</SelectItem>
                  {(sprints || []).map((sprint: Sprint) => (
                    <SelectItem key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
          </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("common.saving")}
                </>
              ) : (
                t("common.saveChanges")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
