"use client"

import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Trash2, Pencil, Play, Calendar, Clock, Repeat, MapPin, GitBranch } from "lucide-react"
import { type RecurringTaskTemplate, type RecurringFrequency } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { formatMediumDate } from "@/lib/format-date"

/** One recurring template as a card, and the labels the list and the dialog share. */
export const FREQUENCY_VALUES: RecurringFrequency[] = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
  "CUSTOM",
]

export const PRIORITIES = [
  { value: "LOW", color: "text-slate-500 bg-slate-100 dark:bg-slate-800" },
  { value: "MEDIUM", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  { value: "HIGH", color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30" },
  { value: "URGENT", color: "text-red-600 bg-red-100 dark:bg-red-900/30" },
]

export const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

type TFn = (key: string, opts?: Record<string, unknown>) => string

function getFrequencyLabel(freq: RecurringFrequency, customDays: number | null | undefined, t: TFn): string {
  if (freq === "CUSTOM" && customDays) return t("tasks.recurring.everyNDaysValue", { count: customDays })
  return t(`tasks.recurring.frequencies.${freq}`)
}

function getPriorityColor(priority: string): string {
  return PRIORITIES.find((p) => p.value === priority)?.color || PRIORITIES[0]!.color
}

// ============================================================================
// Template Card
// ============================================================================

export const TemplateCard = memo(function TemplateCard({
  template,
  onEdit,
  onDelete,
  onGenerate,
  onToggle,
}: {
  template: RecurringTaskTemplate
  onEdit: () => void
  onDelete: () => void
  onGenerate: () => void
  onToggle: (active: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="overflow-hidden rounded-[22px] bg-card shadow-shell">
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-shell-accent-soft">
            <Repeat className="size-5 text-shell-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="truncate text-[15px] font-semibold text-foreground">{template.title}</h3>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${getPriorityColor(template.priority)}`}
              >
                {t(`tasks.priority.${template.priority}`)}
              </span>
            </div>
            {template.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{template.description}</p>
            )}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                {getFrequencyLabel(template.frequency, template.customDays, t)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {template.space?.name ?? t("tasks.recurring.noSpace")}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {template.workflow?.name ?? t("tasks.recurring.defaultType")}
              </span>
              {template.nextRunAt && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {t("tasks.recurring.nextRun", {
                    date: template.nextRunAt ? formatMediumDate(template.nextRunAt) : "-",
                  })}
                </span>
              )}
              {template.estimatedHours && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {template.estimatedHours}h
                </span>
              )}
              {template.checklist && template.checklist.length > 0 && (
                <span className="text-muted-foreground">
                  {t("tasks.recurring.checklistItemsCount", { count: template.checklist.length })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch checked={template.isActive} onCheckedChange={onToggle} />
            <Button variant="outline" size="pill" onClick={onGenerate} disabled={!template.isActive}>
              <Play className="h-3 w-3" />
              {t("tasks.recurring.generate")}
            </Button>
            <Button variant="ghost" size="pillIcon" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="pillIcon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
})
