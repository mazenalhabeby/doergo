import { format } from "date-fns"
import type { useTranslation } from "react-i18next"
import type { Phase, Sprint } from "@/lib/api"

/** The one-line summaries beside each collapsed section of the New Task dialog (plain values, no hooks). */
export function createTaskIndicators({
  t,
  startDate,
  dueDate,
  dueTime,
  estimatedHours,
  locationAddress,
  checklistItems,
  phaseId,
  sprintId,
  phases,
  sprints,
  customFieldValues,
}: {
  t: ReturnType<typeof useTranslation>["t"]
  startDate: Date | undefined
  dueDate: Date | undefined
  dueTime: string
  estimatedHours: string
  locationAddress: string
  checklistItems: string[]
  phaseId: string
  sprintId: string
  phases: Phase[] | undefined
  sprints: Sprint[] | undefined
  customFieldValues: Record<string, string>
}) {
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

  return { scheduleIndicator, locationIndicator, checklistIndicator, orgIndicator, customFieldIndicator }
}
