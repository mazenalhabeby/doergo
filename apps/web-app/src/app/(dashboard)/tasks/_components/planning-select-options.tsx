"use client"

import { useTranslation } from "react-i18next"
import { SelectContent, SelectItem } from "@/components/ui/select"
import type { Phase, Sprint } from "@/lib/api"

/*
  The options of the Phase and Sprint pickers, with "none" first. The New Task
  dialog and the Edit dialog size their triggers differently, so only the
  list is shared.
*/

export function PhaseSelectContent({ phases }: { phases: Phase[] | undefined }) {
  const { t } = useTranslation()
  return (
    <SelectContent>
      <SelectItem value="none">{t("tasks.sidebar.noPhase")}</SelectItem>
      {(phases || []).map((phase: Phase) => (
        <SelectItem key={phase.id} value={phase.id}>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
            {phase.name}
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  )
}

export function SprintSelectContent({ sprints }: { sprints: Sprint[] | undefined }) {
  const { t } = useTranslation()
  return (
    <SelectContent>
      <SelectItem value="none">{t("tasks.sidebar.noSprint")}</SelectItem>
      {(sprints || []).map((sprint: Sprint) => (
        <SelectItem key={sprint.id} value={sprint.id}>
          {sprint.name}
        </SelectItem>
      ))}
    </SelectContent>
  )
}
