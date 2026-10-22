"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"

import { useAuth } from "@/contexts/auth-context"
import { useSpaceModulesQuery } from "@/hooks/use-space-modules"
import { useTaskAttachments } from "./use-task-attachments"
import { useVisitClient } from "./use-visit-client"
import { useCreateTaskSubmit } from "./use-create-task-submit"
import { useCreateTaskLists } from "./use-create-task-lists"
import { createTaskIndicators } from "./create-task-indicators"
import { useCreateTaskType, useSpaceTaskType } from "./use-create-task-type"
import { useCreateTaskAssignment } from "./use-create-task-assignment"
import type { CreateTaskDialogProps } from "./create-task-types"
export type { CreateTaskDialogProps } from "./create-task-types"
import { useRepeatState } from "./use-repeat-state"
import { useTaskSpaces } from "./use-task-spaces"

/**
 * Everything the New Task dialog holds, loads and submits. The dialog and its
 * sections (this folder) only render it.
 */
export function useCreateTaskForm({
  open, onOpenChange, defaultSprintId, defaultSpaceId, defaultCustomerId, defaultDueDate,
}: CreateTaskDialogProps) {
  const { t } = useTranslation()
  const { user, hasModule: orgHasModule, hasPlanFeature, hasPermission } = useAuth()
  const canRecur = hasPlanFeature("recurring") // Recurring tasks = Professional+

  // ── Space state ──
  const [spaceId, setSpaceId] = useState<string>("none")

  // ── Task Type (workflow) and the modules it runs with (use-create-task-type.ts) ──
  const { workflowId, setWorkflowId, orgWorkflows, workflows, hasModule, canCustomFields } =
    useCreateTaskType({ open, spaceId, orgHasModule })

  // ── Core form state ──
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM")

  // ── Agile fields ──
  const [storyPoints, setStoryPoints] = useState<number | null>(null)
  const [epicId, setEpicId] = useState("none")

  // ── Schedule section ──
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  /*
    The hour the member is expected on site, "" when the job is only dated.

    ⚠️ Midnight IS the "no time given" value — every task made before this
    existed carries one, and the phone treats it as a date-only job. So the time
    is held separately and only written onto the date when somebody sets it;
    picking a date alone must keep producing midnight, or thousands of existing
    tasks would start counting down to a departure at eleven the night before.
  */
  const [dueTime, setDueTime] = useState("")

  const [startDate, setStartDate] = useState<Date | undefined>(undefined)

  // ── Repeat (recurring) section (create-task-sections.ts) ──
  const {
    isRecurring, setIsRecurring, frequency, setFrequency, customDays, setCustomDays, dayOfWeek, setDayOfWeek,
    dayOfMonth, setDayOfMonth, recurStart, setRecurStart, recurEnd, setRecurEnd,
  } = useRepeatState()
  const [estimatedHours, setEstimatedHours] = useState("")

  /*
    Who is being visited, and where they are.

    A visit task needs a destination before GPS means anything: the route, the
    arrival and the distance all measure against a point. That point already
    exists on the client's address, so asking somebody to retype it — and
    re-find it on a map — is asking them to copy data the product is holding.

    `customerId` was previously only ever a prop, set when the dialog was opened
    from a client's page and invisible everywhere else. It is state now, so a
    visit can be raised from the tasks board, and the prop simply seeds it.
  */
  const [customerId, setCustomerId] = useState<string>(defaultCustomerId ?? "none")
  const [visitAddressId, setVisitAddressId] = useState<string>("none")

  // ── Location section ──
  const [locationAddress, setLocationAddress] = useState("")
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)

  // ── Checklist section ──
  const [checklistItems, setChecklistItems] = useState<string[]>([])
  const [newChecklistItem, setNewChecklistItem] = useState("")

  // ── Organization section ──
  const [phaseId, setPhaseId] = useState("none")
  const [sprintId, setSprintId] = useState("none")
  const [parentTaskId, setParentTaskId] = useState("none")

  // ── Attachments ──
  const {
    isDragOver,
    setIsDragOver,
    attachments,
    setAttachments,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileSelect,
    removeAttachment,
  } = useTaskAttachments()

  // ── Custom fields ──
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})

  // ── Reset form when dialog opens ──
  useEffect(() => {
    if (open) {
      setSpaceId(defaultSpaceId ?? "none")
      setTitle("")
      setDescription("")
      setPriority("MEDIUM")
      setDueDate(defaultDueDate ?? undefined)
      setDueTime(defaultDueDate && (defaultDueDate.getHours() || defaultDueDate.getMinutes()) ? format(defaultDueDate, "HH:mm") : "")
      setStartDate(undefined)
      setEstimatedHours("")
      setCustomerId(defaultCustomerId ?? "none")
      setVisitAddressId("none")
      setLocationAddress("")
      setLocationLat(null)
      setLocationLng(null)
      setChecklistItems([])
      setNewChecklistItem("")
      setPhaseId("none")
      setSprintId(defaultSprintId ?? "none")
      setParentTaskId("none")
      setAttachments([])
      setCustomFieldValues({})
      setIsDragOver(false)
      setIsSubmittingLocal(false)
      setStoryPoints(null)
      setEpicId("none")
      // Reopening the dialog must not silently reuse the last people picked.
      setAssigneeIds([])
      setAssignMode("people")
      setOpenRole({ roleId: null, spots: 1 })
    }
  }, [open])

  // ── Custom fields, phases, sprints, epics (use-create-task-lists.ts) ──
  const { activeCustomFields, phases, sprints, fetchedEpics } = useCreateTaskLists(open)

  // ── Who it is for: people or a work role (use-create-task-assignment.ts) ──
  const {
    assigneeIds, setAssigneeIds, assignMode, setAssignMode, openRole, setOpenRole,
    isSelfScope, showAssigneePicker, roleModeAvailable, members,
  } = useCreateTaskAssignment({ open, user, hasPermission, spaceId, isRecurring })

  // ── Fetch spaces (create-task-sections.ts) ──
  const { availableSpaces, hasSpaces } = useTaskSpaces({ open, spaceId, setSpaceId, defaultSpaceId })

  // ── Effective workflow comes from the SELECTED SPACE (task type = space's) ──
  // The task itself is always created with no explicit workflowId so the backend
  // inherits the space's; we only need the space's workflowId here to filter
  // which custom fields apply.
  const { data: spaceModules } = useSpaceModulesQuery(spaceId !== "none" ? spaceId : null, {
    staleTime: 300000,
    enabled: open,
  })
  const { visitClients, visitAddressOptions, pinnedClient, applyVisitAddress } = useVisitClient({
    open,
    spaceId,
    hasModule,
    defaultCustomerId,
    customerId,
    visitAddressId,
    setVisitAddressId,
    setLocationAddress,
    setLocationLat,
    setLocationLng,
  })

  // ── The workspace's own type, by name, and the custom fields that apply (use-create-task-type.ts) ──
  const { spaceWorkflowId, spaceWorkflowName, applicableCustomFields } = useSpaceTaskType({
    open, spaceId, spaceModules, workflows, orgWorkflows, workflowId, canCustomFields, activeCustomFields,
  })

  // ── Submission state ──
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false)

  const { handleSubmit, isFormValid, isSubmitting, requiredCustomFieldsMissing } = useCreateTaskSubmit({
    onOpenChange,
    user,
    isSubmittingLocal,
    setIsSubmittingLocal,
    attachments,
    title,
    description,
    priority,
    spaceId,
    workflowId,
    dueDate,
    startDate,
    estimatedHours,
    customerId,
    locationAddress,
    locationLat,
    locationLng,
    checklistItems,
    phaseId,
    sprintId,
    parentTaskId,
    storyPoints,
    epicId,
    customFieldValues,
    applicableCustomFields,
    isSelfScope,
    assigneeIds,
    roleModeAvailable,
    assignMode,
    openRole,
    isRecurring,
    frequency,
    customDays,
    dayOfWeek,
    dayOfMonth,
    recurStart,
    recurEnd,
  })

  // ── Checklist handlers ──
  const addChecklistItem = () => {
    if (newChecklistItem.trim()) {
      setChecklistItems((prev) => [...prev, newChecklistItem.trim()])
      setNewChecklistItem("")
    }
  }

  const removeChecklistItem = (index: number) => {
    setChecklistItems((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Custom field handler ──
  const setCustomFieldValue = (defId: string, value: string) => {
    setCustomFieldValues((prev) => ({ ...prev, [defId]: value }))
  }

  // ── Section indicators (create-task-indicators.ts) ──
  const { scheduleIndicator, locationIndicator, checklistIndicator, orgIndicator } = createTaskIndicators({
    t, startDate, dueDate, dueTime, estimatedHours, locationAddress, checklistItems, phaseId, sprintId, phases, sprints,
    customFieldValues,
  })

  const hasPhases = (phases ?? []).length > 0
  const hasSprints = (sprints ?? []).length > 0
  const hasCustomFields = applicableCustomFields.length > 0

  return {
    // Workspace & type
    defaultCustomerId, spaceId, setSpaceId, workflowId, setWorkflowId, workflows, spaceWorkflowId, spaceWorkflowName,
    availableSpaces, hasSpaces, hasModule,
    // Core
    title, setTitle, description, setDescription, priority, setPriority,
    // Repeat
    canRecur, isRecurring, setIsRecurring, frequency, setFrequency, customDays, setCustomDays,
    dayOfWeek, setDayOfWeek, dayOfMonth, setDayOfMonth, recurStart, setRecurStart, recurEnd, setRecurEnd,
    // Schedule
    startDate, setStartDate, dueDate, setDueDate, dueTime, setDueTime, estimatedHours, setEstimatedHours,
    scheduleIndicator,
    // Assignment
    isSelfScope, showAssigneePicker, roleModeAvailable, assignMode, setAssignMode, openRole, setOpenRole,
    assigneeIds, setAssigneeIds, members,
    // Visit & location
    customerId, setCustomerId, visitAddressId, setVisitAddressId, visitClients, visitAddressOptions,
    pinnedClient, applyVisitAddress, locationAddress, setLocationAddress, locationLat, setLocationLat,
    locationLng, setLocationLng, locationIndicator,
    // Checklist
    checklistItems, newChecklistItem, setNewChecklistItem, addChecklistItem, removeChecklistItem,
    checklistIndicator,
    // Organization
    phases, sprints, hasPhases, hasSprints, phaseId, setPhaseId, sprintId, setSprintId,
    parentTaskId, setParentTaskId, orgIndicator,
    // More options
    storyPoints, setStoryPoints, epicId, setEpicId, fetchedEpics, hasCustomFields,
    applicableCustomFields, customFieldValues, setCustomFieldValue,
    // Attachments
    isDragOver, attachments, handleDrop, handleDragOver, handleDragLeave, handleFileSelect,
    removeAttachment,
    // Submit
    handleSubmit, isFormValid, isSubmitting, requiredCustomFieldsMissing,
  }
}

export type CreateTaskForm = ReturnType<typeof useCreateTaskForm>
