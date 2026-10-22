"use client"

import { useTranslation } from "react-i18next"
import { SlidersHorizontal } from "lucide-react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { CollapsibleSection } from "./collapsible-section"
import { renderCustomFieldInput } from "./custom-field-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { STORY_POINT_OPTIONS, type Epic, type CustomFieldDefinition } from "@/lib/api"
import { type CreateTaskForm } from "./use-create-task-form"

/** Story points, epic and custom fields. */
export function MoreOptionsSection({ form }: { form: CreateTaskForm }) {
  const { t } = useTranslation()
  const {
    hasModule,
    storyPoints,
    setStoryPoints,
    epicId,
    setEpicId,
    fetchedEpics,
    hasCustomFields,
    applicableCustomFields,
    customFieldValues,
    setCustomFieldValue,
    isSubmitting,
  } = form
  if (!(hasModule('story_points') || hasModule('epics') || hasCustomFields)) return null

  return (
    <CollapsibleSection
      icon={SlidersHorizontal}
      label={t("tasks.create.moreOptions")}
      indicator={[
        hasModule('story_points') && storyPoints != null ? t("tasks.units.points", { count: storyPoints }) : null,
        hasModule('epics') && epicId !== "none" ? t("tasks.create.epicSet") : null,
      ].filter(Boolean).join(" · ") || null}
    >
      {/* Story Points */}
      {hasModule('story_points') && (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{t("tasks.sidebar.storyPoints")}</Label>
        <div className="flex items-center gap-1">
          {STORY_POINT_OPTIONS.map((pts) => (
            <button
              key={pts}
              type="button"
              onClick={() => setStoryPoints(storyPoints === pts ? null : pts)}
              disabled={isSubmitting}
              className={cn(
                "h-7 min-w-[32px] px-2 rounded-md text-xs font-bold tabular-nums transition-colors duration-100",
                storyPoints === pts
                  ? "bg-blue-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {pts}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Epic */}
      {hasModule('epics') && (fetchedEpics ?? []).length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t("tasks.sidebar.epic")}</Label>
          <Select value={epicId} onValueChange={setEpicId} disabled={isSubmitting}>
            <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
              <SelectValue placeholder={t("tasks.sidebar.noEpic")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("tasks.sidebar.noEpic")}</SelectItem>
              {(fetchedEpics ?? []).map((epic: Epic) => (
                <SelectItem key={epic.id} value={epic.id}>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
                    {epic.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}


      {/* Custom Fields */}
      {hasCustomFields && applicableCustomFields.map((field: CustomFieldDefinition) => (
        <div key={field.id} className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {field.name}
            {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          {renderCustomFieldInput(field, customFieldValues[field.id] ?? "", (v) =>
            setCustomFieldValue(field.id, v),
            isSubmitting,
            t,
          )}
        </div>
      ))}
    </CollapsibleSection>
  )
}
