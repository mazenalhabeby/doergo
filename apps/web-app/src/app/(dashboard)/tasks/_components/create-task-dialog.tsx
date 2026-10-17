"use client"

import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { PrioritySelector } from "@/components/tasks"
import { useCreateTaskForm, type CreateTaskDialogProps } from "./create-task/use-create-task-form"
import { WorkspaceTypeFields } from "./create-task/workspace-type-fields"
import { RepeatSection } from "./create-task/repeat-section"
import { ScheduleSection } from "./create-task/schedule-section"
import { AssignmentSection } from "./create-task/assignment-section"
import { LocationSection } from "./create-task/location-section"
import { ChecklistSection } from "./create-task/checklist-section"
import { OrganizationSection } from "./create-task/organization-section"
import { MoreOptionsSection } from "./create-task/more-options-section"
import { AttachmentsDropzone } from "./create-task/attachments-dropzone"

/**
 * The New Task dialog. Its state, loading and submit live in
 * `create-task/use-create-task-form.ts`; each section renders from that form.
 */
export function CreateTaskDialog(props: CreateTaskDialogProps) {
  const { open, onOpenChange } = props
  const { t } = useTranslation()
  const form = useCreateTaskForm(props)
  const {
    title,
    setTitle,
    description,
    setDescription,
    priority,
    setPriority,
    isRecurring,
    handleSubmit,
    isFormValid,
    isSubmitting,
    requiredCustomFieldsMissing,
  } = form

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold">
            {t("tasks.create.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("tasks.create.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
          <WorkspaceTypeFields form={form} />

          {/* Title */}
          <Input
            data-tour="tasks-dialog-title"
            placeholder={t("tasks.create.taskTitlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            className={"h-9 rounded-lg border-border bg-card text-sm " +
              "placeholder:text-muted-foreground focus:border-blue-500 " +
              "focus:ring-blue-500/20"}
            autoFocus
          />

          {/* Description */}
          <Textarea
            placeholder={t("tasks.create.descriptionPlaceholder")}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            className={"rounded-lg border-border bg-card text-sm " +
              "placeholder:text-muted-foreground focus:border-blue-500 " +
              "focus:ring-blue-500/20 resize-none min-h-[60px]"}
          />

          {/* Priority only */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("tasks.create.priorityLabel")}
            </Label>
            <PrioritySelector value={priority} onChange={setPriority} disabled={isSubmitting} />
          </div>

          <RepeatSection form={form} />

          {/* Collapsible Sections */}
          <div className="space-y-1.5 pt-1">
            <ScheduleSection form={form} />
            <AssignmentSection form={form} />
            <LocationSection form={form} />
            <ChecklistSection form={form} />
            <OrganizationSection form={form} />
            <MoreOptionsSection form={form} />
          </div>

          <AttachmentsDropzone form={form} />

          {/* Submit */}
          <Button
            data-tour="tasks-dialog-save"
            type="submit"
            disabled={!isFormValid || isSubmitting || requiredCustomFieldsMissing}
            className={"w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium " +
              "text-white transition-colors duration-150 mt-2"}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("common.creating")}
              </>
            ) : (
              isRecurring ? t("tasks.recurring.createButton") : t("tasks.list.createTask")
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
