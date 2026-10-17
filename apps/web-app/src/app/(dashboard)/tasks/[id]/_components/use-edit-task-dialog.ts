"use client"

import { keys, invalidateTask } from "@/lib/query-keys"
import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { tasksApi, phasesApi, sprintsApi, workflowsApi, type Task, type UpdateTaskInput } from "@/lib/api"
import { timeOf } from "@/lib/due-time"
import { notify } from "@/lib/toast"
import { useSpaceModules } from "@/hooks/use-space-modules"

export interface EditTaskDialogProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** EditTaskDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useEditTaskDialog({ task, open, onOpenChange }: Pick<EditTaskDialogProps, 'task' | 'open' | 'onOpenChange'>) {
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
  // The hour the member is expected on site; "" when the job is only dated.
  const [dueTime, setDueTime] = useState<string>(timeOf(task.dueDate))
  const [locationAddress, setLocationAddress] = useState(task.locationAddress || "")
  /*
    The coordinates behind the address.

    Editing used to change the address text alone and leave lat/lng untouched,
    so a task could read "Vienna" while its pin — and the route a member is
    navigated along — still pointed at the previous place. The address and the
    point on the map are one fact and are now set together.
  */
  const [locationLat, setLocationLat] = useState<number | null>(task.locationLat ?? null)
  const [locationLng, setLocationLng] = useState<number | null>(task.locationLng ?? null)
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
    queryKey: keys.workflows.lists(),
    queryFn: () => workflowsApi.list(),
    enabled: open,
    staleTime: 60000,
  })
  const { data: phases } = useQuery({
    queryKey: keys.phases.lists(),
    queryFn: () => phasesApi.list(),
    enabled: open,
    staleTime: 60000,
  })

  const { data: sprints } = useQuery({
    queryKey: keys.sprints.lists(),
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
    setDueTime(timeOf(task.dueDate))
      setStartDate(task.startDate ? new Date(task.startDate) : undefined)
      setEstimatedHours(task.estimatedHours != null ? String(task.estimatedHours) : "")
      setLocationAddress(task.locationAddress || "")
      setLocationLat(task.locationLat ?? null)
      setLocationLng(task.locationLng ?? null)
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
      invalidateTask(queryClient, task.id, { timeline: true })
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
      locationLat: locationLat ?? undefined,
      locationLng: locationLng ?? undefined,
      phaseId: phaseId === "none" ? null : phaseId,
      sprintId: sprintId === "none" ? null : sprintId,
      workflowId: workflowId === "none" ? null : workflowId,
    })
  }

  return {
    t,
    title,
    setTitle,
    description,
    setDescription,
    priority,
    setPriority,
    dueDate,
    setDueDate,
    dueTime,
    setDueTime,
    locationAddress,
    setLocationAddress,
    locationLat,
    setLocationLat,
    locationLng,
    setLocationLng,
    startDate,
    setStartDate,
    estimatedHours,
    setEstimatedHours,
    phaseId,
    setPhaseId,
    sprintId,
    setSprintId,
    workflowId,
    setWorkflowId,
    showPhases,
    showSprints,
    flows,
    phases,
    sprints,
    updateMutation,
    isFormValid,
    handleSubmit,
  }
}

/** What EditTaskDialog and its sections read. */
export type EditTaskDialogState = ReturnType<typeof useEditTaskDialog>
