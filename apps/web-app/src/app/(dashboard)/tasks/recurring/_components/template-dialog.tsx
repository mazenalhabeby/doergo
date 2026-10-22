"use client"

import { type RecurringTaskTemplate, type RecurringFrequency } from "@/lib/api"
import { SaveDialogFooter } from "@/components/common/save-dialog-footer"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useTranslation } from "react-i18next"
import { useTemplateDialog } from "../_hooks/use-template-dialog"
import { FREQUENCY_VALUES, PRIORITIES } from "./template-card"
import { RepeatOnFields } from "./repeat-on-fields"
import { ChecklistField } from "./checklist-field"

/** The create/edit dialog of a recurring template. */
export function TemplateDialog({
  open,
  onOpenChange,
  existingTemplate,
  defaultSpaceId = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTemplate: RecurringTaskTemplate | null
  /** Pre-selected space when creating new (e.g. the active space filter). */
  defaultSpaceId?: string | null
}) {
  const { t } = useTranslation()
  const {
    isEditing,
    title,
    setTitle,
    description,
    setDescription,
    spaceId,
    setSpaceId,
    spaces,
    workflowId,
    setWorkflowId,
    taskTypes,
    priority,
    setPriority,
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
    mutation,
  } = useTemplateDialog({ onOpenChange, existingTemplate, defaultSpaceId })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("tasks.recurring.editTemplate") : t("tasks.recurring.createTemplate")}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t("tasks.recurring.editTemplateDescription") : t("tasks.recurring.createTemplateDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label>{t("tasks.columns.title")}</Label>
            <Input
              placeholder={t("tasks.recurring.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{t("tasks.description.label")}</Label>
            <Textarea
              placeholder={t("tasks.recurring.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Space & Task Type — where generated tasks land + their type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tasks.groupBy.space")}</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tasks.create.selectSpace")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tasks.recurring.noSpace")}</SelectItem>
                  {spaces.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.recurring.taskType")}</Label>
              <Select value={workflowId} onValueChange={setWorkflowId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tasks.recurring.default")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tasks.recurring.default")}</SelectItem>
                  {taskTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority & Frequency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tasks.list.priority")}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {t(`tasks.priority.${p.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.recurring.frequency")}</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurringFrequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_VALUES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(`tasks.recurring.frequencies.${f}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <RepeatOnFields
            frequency={frequency}
            customDays={customDays}
            setCustomDays={setCustomDays}
            dayOfWeek={dayOfWeek}
            setDayOfWeek={setDayOfWeek}
            dayOfMonth={dayOfMonth}
            setDayOfMonth={setDayOfMonth}
          />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="template-start">{t("tasks.sidebar.startDate")}</Label>
              <DatePicker id="template-start" value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-end">{t("tasks.recurring.endDateOptional")}</Label>
              <DatePicker id="template-end" clearable value={endDate} onChange={setEndDate} />
            </div>
          </div>

          {/* Estimated Hours & Location */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tasks.sidebar.estimatedHours")}</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                placeholder={t("tasks.fields.estimatedHoursPlaceholder")}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.sidebar.location")}</Label>
              <Input
                placeholder={t("tasks.fields.addressShort")}
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
              />
            </div>
          </div>

          <ChecklistField items={checklistItems} onChange={setChecklistItems} />
        </div>
        <SaveDialogFooter
          onCancel={() => onOpenChange(false)}
          onSave={() => mutation.mutate()}
          disabled={!title.trim() || mutation.isPending}
          pending={mutation.isPending}
          isEditing={isEditing}
        />
      </DialogContent>
    </Dialog>
  )
}
