"use client"

import { useTranslation } from "react-i18next"
import { GitBranch, Layers } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CollapsibleSection } from "./collapsible-section"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type Phase, type Sprint } from "@/lib/api"
import { type CreateTaskForm } from "./use-create-task-form"

/** Phase, sprint and parent task. */
export function OrganizationSection({ form }: { form: CreateTaskForm }) {
  const { t } = useTranslation()
  const {
    hasModule,
    phases,
    sprints,
    hasPhases,
    hasSprints,
    phaseId,
    setPhaseId,
    sprintId,
    setSprintId,
    parentTaskId,
    setParentTaskId,
    orgIndicator,
    isSubmitting,
  } = form
  if (!((hasPhases && hasModule('phases')) || (hasSprints && hasModule('sprints')))) return null

  return (
    <CollapsibleSection icon={Layers} label={t("tasks.create.organization")} indicator={orgIndicator}>
      <div className="grid gap-3 sm:grid-cols-2">
        {hasPhases && hasModule('phases') && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t("tasks.sidebar.phase")}</Label>
            <Select value={phaseId} onValueChange={setPhaseId} disabled={isSubmitting}>
              <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                <SelectValue placeholder={t("tasks.sidebar.noPhase")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("tasks.sidebar.noPhase")}</SelectItem>
                {(phases || []).map((phase: Phase) => (
                  <SelectItem key={phase.id} value={phase.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: phase.color }}
                      />
                      {phase.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {hasSprints && hasModule('sprints') && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t("tasks.sidebar.sprint")}</Label>
            <Select value={sprintId} onValueChange={setSprintId} disabled={isSubmitting}>
              <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                <SelectValue placeholder={t("tasks.sidebar.noSprint")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("tasks.sidebar.noSprint")}</SelectItem>
                {(sprints || []).map((sprint: Sprint) => (
                  <SelectItem key={sprint.id} value={sprint.id}>
                    {sprint.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <GitBranch className="size-3" />
          {t("tasks.create.subtaskOf")}
        </Label>
        <Input
          placeholder={t("tasks.create.parentTaskPlaceholder")}
          value={parentTaskId === "none" ? "" : parentTaskId}
          onChange={(e) => setParentTaskId(e.target.value || "none")}
          disabled={isSubmitting}
          className="h-9 rounded-lg border-border bg-card text-sm"
        />
      </div>
    </CollapsibleSection>
  )
}
