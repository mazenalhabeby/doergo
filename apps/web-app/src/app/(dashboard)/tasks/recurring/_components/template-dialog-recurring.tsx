"use client"

import { Plus, X } from "lucide-react"
import { type RecurringFrequency } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { SaveDialogFooter } from "@/components/common/save-dialog-footer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FREQUENCY_VALUES, PRIORITIES, DAY_KEYS } from "./template-card"
import type { TemplateDialogState } from "../_hooks/use-template-dialog"
import type { TemplateDialog } from "./template-dialog"

/** Part of TemplateDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TemplateDialogRecurring({
  vm,
  onOpenChange,
}: {
  vm: TemplateDialogState
  onOpenChange: Parameters<typeof TemplateDialog>[0]["onOpenChange"]
}) {
  const {
    t,
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
    newChecklistItem,
    setNewChecklistItem,
    addChecklistItem,
    checklistItems,
    setChecklistItems,
    mutation,
  } = vm
  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEditing ? t("tasks.recurring.editTemplate") : t("tasks.recurring.createTemplate")}</DialogTitle>
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

        {/* Frequency-specific options */}
        {frequency === "CUSTOM" && (
          <div className="space-y-2">
            <Label>{t("tasks.recurring.everyNDays")}</Label>
            <Input
              type="number"
              min={1}
              value={customDays}
              onChange={(e) => setCustomDays(parseInt(e.target.value) || 1)}
            />
          </div>
        )}

        {["WEEKLY", "BIWEEKLY"].includes(frequency) && (
          <div className="space-y-2">
            <Label>{t("tasks.recurring.dayOfWeek")}</Label>
            <Select value={dayOfWeek.toString()} onValueChange={(v) => setDayOfWeek(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_KEYS.map((name, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {t(`tasks.weekdaysFull.${name}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {["MONTHLY", "QUARTERLY", "YEARLY"].includes(frequency) && (
          <div className="space-y-2">
            <Label>{t("tasks.recurring.dayOfMonth")}</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
            />
          </div>
        )}

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("tasks.sidebar.startDate")}</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("tasks.recurring.endDateOptional")}</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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

        {/* Checklist */}
        <div className="space-y-2">
          <Label>{t("tasks.sections.checklist")}</Label>
          <div className="flex gap-2">
            <Input
              placeholder={t("tasks.create.addChecklistItem")}
              value={newChecklistItem}
              onChange={(e) => setNewChecklistItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklistItem())}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addChecklistItem}
              disabled={!newChecklistItem.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {checklistItems.length > 0 && (
            <div className="space-y-1 mt-2">
              {checklistItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm">
                  <span className="flex-1">{item}</span>
                  <button
                    type="button"
                    onClick={() => setChecklistItems(checklistItems.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <SaveDialogFooter
        onCancel={() => onOpenChange(false)}
        onSave={() => mutation.mutate()}
        disabled={!title.trim() || mutation.isPending}
        pending={mutation.isPending}
        isEditing={isEditing}
      />
    </DialogContent>
  )
}
