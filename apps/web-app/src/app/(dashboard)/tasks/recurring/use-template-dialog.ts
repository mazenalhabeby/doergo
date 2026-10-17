"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { recurringTasksApi, workflowsApi, type RecurringTaskTemplate, type RecurringFrequency } from "@/lib/api"
import { todayKey } from "@hbcfield/shared/client"
import { useActiveSpaces } from "@/hooks/use-space-directory"

/** TemplateDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useTemplateDialog({
  open,
  onOpenChange,
  existingTemplate,
  defaultSpaceId = null,
}: Pick<
  {
    open: boolean
    onOpenChange: (open: boolean) => void
    existingTemplate: RecurringTaskTemplate | null
    /** Pre-selected space when creating new (e.g. the active space filter). */
    defaultSpaceId?: string | null
  },
  "open" | "onOpenChange" | "existingTemplate" | "defaultSpaceId"
>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEditing = !!existingTemplate

  const [title, setTitle] = useState(existingTemplate?.title || "")
  const [description, setDescription] = useState(existingTemplate?.description || "")
  const [priority, setPriority] = useState(existingTemplate?.priority || "MEDIUM")
  const [spaceId, setSpaceId] = useState(existingTemplate?.spaceId || defaultSpaceId || "none")
  const [workflowId, setWorkflowId] = useState(existingTemplate?.workflowId || "none")

  const { data: spaces = [] } = useActiveSpaces()
  const { data: taskTypes = [] } = useQuery({
    queryKey: keys.workflows.lists(),
    queryFn: () => workflowsApi.list(),
  })
  const [frequency, setFrequency] = useState<RecurringFrequency>(existingTemplate?.frequency || "WEEKLY")
  const [customDays, setCustomDays] = useState<number>(existingTemplate?.customDays || 7)
  const [dayOfWeek, setDayOfWeek] = useState<number>(existingTemplate?.dayOfWeek ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState<number>(existingTemplate?.dayOfMonth ?? 1)
  const [startDate, setStartDate] = useState(
    existingTemplate?.startDate ? existingTemplate.startDate.split("T")[0] : todayKey(),
  )
  const [endDate, setEndDate] = useState(existingTemplate?.endDate ? existingTemplate.endDate.split("T")[0] : "")
  const [estimatedHours, setEstimatedHours] = useState<string>(existingTemplate?.estimatedHours?.toString() || "")
  const [locationAddress, setLocationAddress] = useState(existingTemplate?.locationAddress || "")
  const [checklistItems, setChecklistItems] = useState<string[]>(existingTemplate?.checklist?.map((c) => c.text) || [])
  const [newChecklistItem, setNewChecklistItem] = useState("")

  const buildPayload = () => ({
    title,
    description: description || null,
    priority,
    spaceId: spaceId === "none" ? null : spaceId,
    workflowId: workflowId === "none" ? null : workflowId,
    frequency,
    customDays: frequency === "CUSTOM" ? customDays : null,
    dayOfWeek: ["WEEKLY", "BIWEEKLY"].includes(frequency) ? dayOfWeek : null,
    dayOfMonth: ["MONTHLY", "QUARTERLY", "YEARLY"].includes(frequency) ? dayOfMonth : null,
    startDate: new Date(startDate).toISOString(),
    endDate: endDate ? new Date(endDate).toISOString() : null,
    estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
    locationAddress: locationAddress || null,
    checklist: checklistItems.length > 0 ? checklistItems.map((text) => ({ text })) : null,
  })

  const createMutation = useMutation({
    mutationFn: () => recurringTasksApi.create(buildPayload()),
    onSuccess: () => {
      notify.success(t("tasks.recurring.templateCreated"))
      queryClient.invalidateQueries({ queryKey: keys.recurringTasks.lists() })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () => recurringTasksApi.update(existingTemplate!.id, buildPayload()),
    onSuccess: () => {
      notify.success(t("tasks.recurring.templateUpdated"))
      queryClient.invalidateQueries({ queryKey: keys.recurringTasks.lists() })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const mutation = isEditing ? updateMutation : createMutation

  const addChecklistItem = () => {
    const trimmed = newChecklistItem.trim()
    if (trimmed) {
      setChecklistItems([...checklistItems, trimmed])
      setNewChecklistItem("")
    }
  }

  return {
    t,
    isEditing,
    title,
    setTitle,
    description,
    setDescription,
    priority,
    setPriority,
    spaceId,
    setSpaceId,
    workflowId,
    setWorkflowId,
    spaces,
    taskTypes,
    frequency,
    setFrequency,
    customDays,
    setCustomDays,
    dayOfWeek,
    setDayOfWeek,
    dayOfMonth,
    setDayOfMonth,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    estimatedHours,
    setEstimatedHours,
    locationAddress,
    setLocationAddress,
    checklistItems,
    setChecklistItems,
    newChecklistItem,
    setNewChecklistItem,
    mutation,
    addChecklistItem,
  }
}

/** What TemplateDialog and its sections read. */
export type TemplateDialogState = ReturnType<typeof useTemplateDialog>
