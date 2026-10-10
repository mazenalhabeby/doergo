"use client"

import { keys } from "@/lib/query-keys"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import {
  tasksApi,
  taskAttachmentsApi,
  uploadToS3,
  recurringTasksApi,
  type CreateTaskInput,
  type CustomFieldDefinition,
  type RecurringFrequency,
} from "@/lib/api"
import { notify } from "@/lib/toast"
import { type RoleAssignValue } from "../role-assign-field"

/**
 * What the New Task dialog sends, down its two paths: a one-off task, or a
 * recurring template (when Repeat is on). Every field the form holds is named
 * in one of the two payloads below — `create-task-dialog.payload.spec.ts`
 * fails when one is not.
 */
export function useCreateTaskSubmit({
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
}: {
  onOpenChange: (open: boolean) => void
  user: ReturnType<typeof useAuth>["user"]
  isSubmittingLocal: boolean
  setIsSubmittingLocal: (submitting: boolean) => void
  attachments: File[]
  title: string
  description: string
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  spaceId: string
  workflowId: string
  dueDate: Date | undefined
  startDate: Date | undefined
  estimatedHours: string
  customerId: string
  locationAddress: string
  locationLat: number | null
  locationLng: number | null
  checklistItems: string[]
  phaseId: string
  sprintId: string
  parentTaskId: string
  storyPoints: number | null
  epicId: string
  customFieldValues: Record<string, string>
  applicableCustomFields: CustomFieldDefinition[]
  isSelfScope: boolean
  assigneeIds: string[]
  roleModeAvailable: boolean
  assignMode: "people" | "role"
  openRole: RoleAssignValue
  isRecurring: boolean
  frequency: RecurringFrequency
  customDays: number
  dayOfWeek: number
  dayOfMonth: number
  recurStart: string
  recurEnd: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: async (task) => {
      /*
        Upload the attachments the task was created with.

        A failure here used to reach console.error and nothing else: the dialog
        closed on a success toast and the file was simply absent, which is
        indistinguishable from never having attached it. The task IS created by
        this point — that is not undone for a failed file — but the ones that
        did not make it are named, so they can be added again rather than
        discovered missing later.
      */
      const failedUploads: string[] = []
      if (attachments.length > 0 && task?.id) {
        for (const file of attachments) {
          try {
            const presign = await taskAttachmentsApi.getPresignedUrl(task.id, file.name, file.type)
            if (!presign?.uploadUrl) throw new Error("No upload URL")
            /*
              `uploadToS3`, not a bare fetch.

              fetch resolves on a 403 as happily as on a 200, and this call used
              to ignore the response entirely — so a rejected upload went
              straight on to be confirmed, and the attachment was recorded
              pointing at an object that was never stored. The detail page has
              always used this helper, which rejects on a non-2xx; the two paths
              now fail the same way.
            */
            await uploadToS3(presign.uploadUrl, file)
            await taskAttachmentsApi.confirmUpload(task.id, {
              fileName: file.name,
              fileKey: presign.fileKey,
              fileUrl: presign.fileUrl,
              fileType: file.type,
              fileSize: file.size,
            })
          } catch {
            failedUploads.push(file.name)
          }
        }
      }

      notify.taskCreated(title || t("tasks.create.successMessage"))
      if (failedUploads.length > 0) {
        notify.error(
          t("tasks.create.attachmentsFailed", {
            files: failedUploads.join(", "),
            defaultValue: `Could not attach: ${failedUploads.join(", ")}`,
          }),
        )
      }
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: keys.tasks.counts() })
    },
    onError: (error: Error) => {
      notify.error(error.message || t("tasks.create.errorMessage"))
      setIsSubmittingLocal(false)
    },
  })

  // Recurring template create (when the Repeat toggle is on)
  const recurringMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => recurringTasksApi.create(input),
    onSuccess: () => {
      notify.success(t("tasks.recurring.created"), t("tasks.recurring.createdDescription"))
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: keys.recurringTasks.lists() })
    },
    onError: (error: Error) => {
      notify.error(error.message || t("tasks.recurring.createFailed"))
      setIsSubmittingLocal(false)
    },
  })

  // ── Validation ──
  const isFormValid = title.trim() !== ""
  const isSubmitting = isSubmittingLocal || createMutation.isPending || recurringMutation.isPending

  // ── Custom field validation ──
  const requiredCustomFieldsMissing = applicableCustomFields
    .filter((f) => f.isRequired)
    .some((f) => !customFieldValues[f.id]?.trim())

  // ── Submit ──
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isSubmitting) return

    if (!isFormValid) {
      notify.error(t("tasks.create.fillRequiredFields"))
      return
    }

    if (requiredCustomFieldsMissing) {
      notify.error(t("tasks.create.fillRequiredCustomFields"))
      return
    }

    setIsSubmittingLocal(true)

    const parsedHours = estimatedHours ? parseFloat(estimatedHours) : undefined
    // Build custom field values array
    const cfValues = Object.entries(customFieldValues)
      .filter(([, v]) => v.trim())
      .map(([defId, value]) => ({ definitionId: defId, value }))

    // Build assignee list
    // A task takes several people; the dialog now says so too.
    const submitAssigneeIds: string[] = isSelfScope && user?.id ? [user.id] : assigneeIds
    // A role is sent INSTEAD of people, never with them (the server refuses both).
    const byRole = roleModeAvailable && assignMode === "role" && !!openRole.roleId

    // Recurring path — create a template instead of a one-off task. Reuses the
    // same title/space/type/priority/checklist already filled in above.
    if (isRecurring) {
      recurringMutation.mutate({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        spaceId: spaceId !== "none" ? spaceId : null,
        // Task type: explicit pick, else null = inherit the space's workflow.
        workflowId: workflowId !== "inherit" ? workflowId : null,
        frequency,
        customDays: frequency === "CUSTOM" ? customDays : null,
        dayOfWeek: ["WEEKLY", "BIWEEKLY"].includes(frequency) ? dayOfWeek : null,
        dayOfMonth: ["MONTHLY", "QUARTERLY", "YEARLY"].includes(frequency) ? dayOfMonth : null,
        startDate: new Date(recurStart).toISOString(),
        endDate: recurEnd ? new Date(recurEnd).toISOString() : null,
        estimatedHours: parsedHours && !isNaN(parsedHours) ? parsedHours : null,
        locationAddress: locationAddress.trim() || null,
        /*
          The client it repeats FOR.

          ⚠️ The one-off path has sent this since client visits shipped and the
          recurring path did not, so the commonest visit of all — the monthly
          service call to a customer — generated tasks with the right address
          and no client on them. "What have we done for this client" then
          answered with one-offs only, and nothing on screen suggested anything
          was missing. Exactly the same mistake, and the same shape, as the
          coordinates immediately below.
        */
        customerId: customerId !== "none" ? customerId : null,
        // The recurring API accepts these and the dialog was not sending them,
        // so a repeating task kept the address text and lost the point on the
        // map — every task it generated had no coordinates to route to.
        locationLat: locationLat ?? null,
        locationLng: locationLng ?? null,
        checklist: checklistItems.length > 0 ? checklistItems.map((text) => ({ text })) : null,
        assigneeIds: submitAssigneeIds.length > 0 ? submitAssigneeIds : null,
      })
      return
    }

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate?.toISOString(),
      startDate: startDate?.toISOString(),
      estimatedHours: parsedHours && !isNaN(parsedHours) ? parsedHours : undefined,
      locationAddress: locationAddress.trim() || undefined,
      locationLat: locationLat ?? undefined,
      locationLng: locationLng ?? undefined,
      phaseId: phaseId !== "none" ? phaseId : undefined,
      sprintId: sprintId !== "none" ? sprintId : undefined,
      storyPoints: storyPoints ?? undefined,
      epicId: epicId !== "none" ? epicId : undefined,
      parentId: parentTaskId !== "none" ? parentTaskId : undefined,
      spaceId: spaceId !== "none" ? spaceId : undefined,
      customerId: customerId !== "none" ? customerId : undefined,
      // Task type: explicit pick, else omit so the backend inherits the space's.
      workflowId: workflowId !== "inherit" ? workflowId : undefined,
      checklistItems: checklistItems.length > 0
        ? checklistItems.map((text) => ({ text }))
        : undefined,
      customFieldValues: cfValues.length > 0 ? cfValues : undefined,
      assigneeIds: !byRole && submitAssigneeIds.length > 0 ? submitAssigneeIds : undefined,
      openRoleId: byRole ? openRole.roleId! : undefined,
      openSpots: byRole ? openRole.spots : undefined,
    })
  }

  return { handleSubmit, isFormValid, isSubmitting, requiredCustomFieldsMissing }
}
