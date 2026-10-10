"use client"

import { keys } from "@/lib/query-keys"
import { useState, useMemo, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import { useAssignableMembers } from "@/hooks/use-assignable-members"
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import {
  phasesApi,
  sprintsApi,
  epicsApi,
  customFieldsApi,
  locationsApi,
  type Phase,
  type Sprint,
  type RecurringFrequency,
  workflowsApi,
} from "@/lib/api"
import { byAssignableFirst, todayKey } from "@hbcfield/shared/client"
import { useOrgWorkflow } from "@/hooks/use-org-workflow"
import { type RoleAssignValue } from "../role-assign-field"
import { useWorkspaceWorkRoles } from "@/hooks/use-workspace-work-roles"
import { useTaskAttachments } from "./use-task-attachments"
import { useVisitClient } from "./use-visit-client"
import { useCreateTaskSubmit } from "./use-create-task-submit"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSprintId?: string | null
  defaultSpaceId?: string | null
  /** Link the new task to a CRM customer (locks the space to the customer's). */
  defaultCustomerId?: string | null
  /** Opened from the calendar: the day (and hour, when not midnight) that was tapped. */
  defaultDueDate?: Date | null
}

// ---------------------------------------------------------------------------
// CreateTaskDialog
// ---------------------------------------------------------------------------
/**
 * What the assignee picker actually needs from a person.
 *
 * Both sources supply it — a space roster entry and an organization member —
 * and naming the shape keeps that union honest rather than casting the narrower
 * one to the wider.
 */
export type AssigneeOption = {
  id: string
  firstName?: string
  lastName?: string
  enabledModules?: unknown
}

/**
 * Everything the New Task dialog holds, loads and submits. The dialog and its
 * sections (this folder) only render it.
 */
export function useCreateTaskForm({ open, onOpenChange, defaultSprintId, defaultSpaceId, defaultCustomerId, defaultDueDate }: CreateTaskDialogProps) {
  const { t } = useTranslation()
  const { user, hasModule: orgHasModule, hasPlanFeature, hasPermission } = useAuth()
  const canRecur = hasPlanFeature("recurring") // Recurring tasks = Professional+

  // ── Space state ──
  const [spaceId, setSpaceId] = useState<string>("none")

  // ── Task Type (workflow) — "inherit" = use the space's default; otherwise the
  // task carries its own flow so one space can hold tasks of different types. ──
  const [workflowId, setWorkflowId] = useState<string>("inherit")
  const { workflows: orgWorkflows } = useOrgWorkflow()

  /*
    The task types THIS space offers — not every type the organization owns.

    A space chooses its own set now, and the server refuses a type the space
    does not offer, so listing them all would present choices that fail on
    submit. Falls back to the organization's list when no space is picked yet,
    or when a space has no offerings of its own (it still runs on the legacy
    single default).
  */
  const { data: spaceWorkflows } = useQuery({
    queryKey: keys.spaces.workflows(spaceId),
    queryFn: () => workflowsApi.listForSpace(spaceId),
    enabled: open && !!spaceId && spaceId !== "none",
  })
  const workflows: { id: string; name: string }[] = spaceWorkflows?.length ? spaceWorkflows : orgWorkflows

  // ── Space-aware module resolution ──
  const { hasModule: spaceHasModule } = useSpaceModules(spaceId !== "none" ? spaceId : null)
  const hasModule = spaceId !== "none" ? spaceHasModule : orgHasModule
  /*
    ⚠️ This asked `hasPlanFeature` with a module key, and custom fields are a
    MODULE, not an Option.

    `hasPlanFeature` opens with `if (!isAddOn(feature)) return false`, so it
    answered NO for every organization — including the ones with the module
    switched on and being billed €6 a workspace for it. Custom fields never
    appeared in this dialog for anybody, and nothing said why.

    `hasModule` is the right question, and it is the per-SPACE one when a
    workspace is chosen (line above) — which is how the module is sold.
  */
  const canCustomFields = hasModule("custom_fields")

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

  // ── Repeat (recurring) section ──
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>("WEEKLY")
  const [customDays, setCustomDays] = useState<number>(7)
  const [dayOfWeek, setDayOfWeek] = useState<number>(1)
  const [dayOfMonth, setDayOfMonth] = useState<number>(1)
  const [recurStart, setRecurStart] = useState<string>(
    () => todayKey(),
  )
  const [recurEnd, setRecurEnd] = useState<string>("")
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

  // ── Fetch custom fields ──
  const { data: customFields } = useQuery({
    queryKey: keys.customFields.definitions(),
    queryFn: () => customFieldsApi.listDefinitions(),
    staleTime: 120000,
    retry: 1,
    enabled: open,
  })
  const activeCustomFields = useMemo(
    () => (customFields || []).filter((f) => f.isActive),
    [customFields],
  )

  // ── Fetch phases and sprints ──
  const { data: phases } = useQuery({
    queryKey: keys.phases.lists(),
    queryFn: () => phasesApi.list(),
    staleTime: 60000,
    enabled: open,
  })

  const { data: sprints } = useQuery({
    queryKey: keys.sprints.lists(),
    queryFn: () => sprintsApi.list(),
    staleTime: 60000,
    enabled: open,
  })

  // ── Fetch epics ──
  const { data: fetchedEpics } = useQuery({
    queryKey: keys.epics.lists(),
    queryFn: () => epicsApi.list(),
    staleTime: 60000,
    enabled: open,
  })

  /*
    Who the task is being assigned to.

    The picker below had no `value` and no `onValueChange` — an uncontrolled
    Select that stored nothing. You chose a member, the dialog forgot it, and
    the task was created unassigned, so the only way to assign anyone was to
    open the task afterwards and do it again.
  */
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  /*
    People, or a work role (shared tasks/role-pool.ts): "a Mechanic" instead of
    "Ahmad". Only inside a workspace — a role is a fact about a workspace — and
    only for a one-off task.
  */
  const [assignMode, setAssignMode] = useState<"people" | "role">("people")
  const [openRole, setOpenRole] = useState<RoleAssignValue>({ roleId: null, spots: 1 })

  // ── Fetch members for assignee picker ──
  const taskCreationScope = user?.taskCreationScope || "NONE"
  const isSelfScope = taskCreationScope === "SELF"
  /*
    Creating is not assigning.

    Both are needed to offer this control. A creation scope of SPACE says WHERE
    somebody may open a task, not that they may hand it to anyone — an External
    Observer holds `canCreateTasks` through a space role, which resolves to
    SPACE, and would have been shown a picker whose value the server strips.

    `hasPermission` is space-aware, matching what the create route accepts.
  */
  const canAssign = user?.role === "ADMIN" || hasPermission("canAssignTasks")
  const showAssigneePicker =
    canAssign && (taskCreationScope === "SPACE" || taskCreationScope === "ORG")
  // A role belongs to a workspace and a one-off task — and only where that workspace HAS work roles.
  const roleCandidate = showAssigneePicker && spaceId !== "none" && !isRecurring
  const { hasRoles: spaceHasRoles } = useWorkspaceWorkRoles(spaceId !== "none" ? spaceId : null, roleCandidate)
  const roleModeAvailable = roleCandidate && spaceHasRoles
  // A role is a fact about ONE workspace: another workspace starts the choice again.
  useEffect(() => { setOpenRole((r) => (r.roleId ? { ...r, roleId: null } : r)) }, [spaceId])

  /*
    Who can be given this work.

    The WORKSPACE's roster when one is chosen, and the organization directory
    only when none is. Two reasons, and the first is why the picker came up
    empty for a site supervisor:

      • `GET /organizations/members` is `@RequirePermission('canManageUsers')`
        — a permission an external member can never hold, and a space-scoped
        manager holds org-wide only if somebody made them an admin. The request
        403s, the list renders empty, and the dialog offers a control that
        cannot be used. `GET /locations/:id/members` needs no permission: it is
        a space's own roster, org-scoped in the service.

      • It is the better answer anyway. Work at a site goes to the people at
        that site, and the roster is a handful of rows rather than a directory
        truncated at fifty — beyond which a member simply could not be picked.
  */
  // "none" is this dialog's unset sentinel, not an empty string.
  const hasSpace = !!spaceId && spaceId !== "none"
  // No workspace chosen: the directory for whoever may read it, otherwise the
  // rosters of the workspaces this person can see (lib/assignable-members.ts).
  const { members: assignable } = useAssignableMembers({
    spaceId: hasSpace ? spaceId : null,
    rosterOnly: true,
    enabled: open && showAssigneePicker,
  })
  const members: AssigneeOption[] = useMemo(
    () => [...assignable].sort(byAssignableFirst),
    [assignable],
  )

  // ── Fetch spaces ──
  const { data: spacesData } = useQuery({
    queryKey: keys.locations.list(),
    queryFn: () => locationsApi.list(),
    staleTime: 60000,
    enabled: open,
  })
  const availableSpaces = spacesData?.data || []
  const hasSpaces = availableSpaces.length > 0

  // Every task belongs to a space — once spaces load, default the picker to the
  // org's "General" (default) space instead of leaving it unselected.
  useEffect(() => {
    if (open && spaceId === "none" && !defaultSpaceId && availableSpaces.length) {
      const def =
        availableSpaces.find((s) => s.isDefault) ??
        availableSpaces.find((s) => s.name === "General") ??
        availableSpaces[0]
      if (def?.id) setSpaceId(def.id)
    }
  }, [open, availableSpaces, defaultSpaceId, spaceId])

  // ── Effective workflow comes from the SELECTED SPACE (task type = space's) ──
  // The task itself is always created with no explicit workflowId so the backend
  // inherits the space's; we only need the space's workflowId here to filter
  // which custom fields apply.
  const { data: spaceModules } = useQuery({
    queryKey: keys.spaces.modules(spaceId),
    queryFn: () => locationsApi.getEffectiveModules(spaceId),
    staleTime: 300000,
    enabled: open && spaceId !== "none",
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

  const spaceWorkflowId = spaceId !== "none" ? spaceModules?.workflowId ?? null : null
  /*
    The workspace's own flow by NAME, for the "Workspace default (…)" choice.
    ⚠️ It is not always among the types offered (a workspace may offer others
    and keep a legacy default) — the label read "Workspace default ()". Looked
    up in what is loaded first, fetched only when it is missing.
  */
  const knownSpaceWorkflowName = spaceWorkflowId
    ? (workflows.find((w) => w.id === spaceWorkflowId) ?? orgWorkflows?.find((w) => w.id === spaceWorkflowId))?.name ?? null
    : null
  const { data: fetchedSpaceWorkflow } = useQuery({
    queryKey: keys.spaces.workflow(spaceWorkflowId),
    queryFn: () => workflowsApi.getById(spaceWorkflowId!),
    enabled: open && !!spaceWorkflowId && !knownSpaceWorkflowName,
    staleTime: 120000,
    retry: 1,
  })
  const spaceWorkflowName = knownSpaceWorkflowName ?? fetchedSpaceWorkflow?.name ?? null
  // The task's effective type: an explicit pick, else inherited from the space.
  const effectiveWorkflowId = workflowId !== "inherit" ? workflowId : spaceWorkflowId

  // Fields applicable to the chosen Task Type: globals always, plus that
  // workflow's own fields. No type → globals only.
  const applicableCustomFields = useMemo(
    // Custom Fields is a Professional+ feature — don't render the inputs below tier
    // (the backend also 402s the write; this keeps a downgraded org from seeing them).
    () => (canCustomFields ? activeCustomFields.filter((f) => f.workflowId == null || f.workflowId === effectiveWorkflowId) : []),
    [activeCustomFields, effectiveWorkflowId, canCustomFields],
  )

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

  // ── Section indicators ──
  const scheduleIndicator =
    startDate || dueDate || estimatedHours
      ? [
          startDate && format(startDate, "MMM d"),
          dueDate && (dueTime ? `${format(dueDate, "MMM d")} ${dueTime}` : format(dueDate, "MMM d")),
          estimatedHours && `${estimatedHours}h`,
        ]
          .filter(Boolean)
          .join(" - ")
      : null

  const locationIndicator = locationAddress || null
  const checklistIndicator =
    checklistItems.length > 0 ? t("tasks.create.itemsCount", { count: checklistItems.length }) : null
  const orgIndicator =
    phaseId !== "none" || sprintId !== "none"
      ? [
          phaseId !== "none" && phases?.find((p: Phase) => p.id === phaseId)?.name,
          sprintId !== "none" && sprints?.find((s: Sprint) => s.id === sprintId)?.name,
        ]
          .filter(Boolean)
          .join(", ")
      : null
  const customFieldIndicator =
    Object.values(customFieldValues).filter((v) => v.trim()).length > 0
      ? `${Object.values(customFieldValues).filter((v) => v.trim()).length} set`
      : null

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
