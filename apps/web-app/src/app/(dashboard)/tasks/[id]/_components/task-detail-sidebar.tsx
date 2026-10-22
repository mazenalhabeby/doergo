"use client"

import { Target, Layers, Zap } from "lucide-react"
import { InlineEditField } from "./inline-edit-field"
import { STORY_POINT_OPTIONS } from "@/lib/api"
import { useTranslation } from "react-i18next"
import type { TaskDetailSidebarProps } from "./task-detail-sidebar-types"
import { SidebarRow } from "./sidebar-row"
import { TaskDetailsCard } from "./task-details-card"

export function TaskDetailSidebar({
  task,
  canEdit,
  canAssign,
  hasModule,
  onFieldSave,
  onAssignClick,
  onRemoveAssignee,
  onSetLead,
  sprints = [],
  phases = [],
  epics = [],
}: TaskDetailSidebarProps) {
  const { t } = useTranslation()
  const hasAgile = hasModule("sprints") || hasModule("phases") || hasModule("epics") || hasModule("story_points")

  return (
    <div className="space-y-4">
      {/* ─── Details Card ─────────────────────────────────────────────── */}
      <TaskDetailsCard
        canAssign={canAssign}
        onAssignClick={onAssignClick}
        onSetLead={onSetLead}
        onRemoveAssignee={onRemoveAssignee}
        task={task}
        canEdit={canEdit}
        onFieldSave={onFieldSave}
      />

      {/* ─── Agile Card ───────────────────────────────────────────────── */}
      {hasAgile && (
        <div data-tour="task-agile" className="bg-card rounded-2xl border border-border shadow-sm p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t("tasks.sidebar.agile")}
          </h3>

          <div className="divide-y divide-border/50">
            {hasModule("sprints") && (
              <SidebarRow icon={Target} label={t("tasks.sidebar.sprint")}>
                <InlineEditField
                  value={task.sprintId}
                  onSave={(v) => onFieldSave("sprintId", v)}
                  type="select"
                  disabled={!canEdit}
                  placeholder={t("tasks.sidebar.noSprint")}
                  options={[
                    { value: "__none__", label: t("tasks.sidebar.noSprint") },
                    ...sprints.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  renderDisplay={() => task.sprint?.name || null}
                />
              </SidebarRow>
            )}

            {hasModule("phases") && (
              <SidebarRow icon={Layers} label={t("tasks.sidebar.phase")}>
                <InlineEditField
                  value={task.phaseId}
                  onSave={(v) => onFieldSave("phaseId", v)}
                  type="select"
                  disabled={!canEdit}
                  placeholder={t("tasks.sidebar.noPhase")}
                  options={[
                    { value: "__none__", label: t("tasks.sidebar.noPhase") },
                    ...phases.map((p) => ({ value: p.id, label: p.name, color: p.color })),
                  ]}
                  renderDisplay={() =>
                    task.phase ? (
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: task.phase.color }} />
                        {task.phase.name}
                      </span>
                    ) : null
                  }
                />
              </SidebarRow>
            )}

            {hasModule("epics") && (
              <SidebarRow icon={Zap} label={t("tasks.sidebar.epic")}>
                <InlineEditField
                  value={task.epicId}
                  onSave={(v) => onFieldSave("epicId", v)}
                  type="select"
                  disabled={!canEdit}
                  placeholder={t("tasks.sidebar.noEpic")}
                  options={[
                    { value: "__none__", label: t("tasks.sidebar.noEpic") },
                    ...epics.map((e) => ({ value: e.id, label: e.name, color: e.color })),
                  ]}
                  renderDisplay={() =>
                    task.epic ? (
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: task.epic.color }} />
                        {task.epic.name}
                      </span>
                    ) : null
                  }
                />
              </SidebarRow>
            )}

            {hasModule("story_points") && (
              <SidebarRow icon={Zap} label={t("tasks.sidebar.storyPoints")}>
                <InlineEditField
                  value={task.storyPoints}
                  onSave={(v) => onFieldSave("storyPoints", v)}
                  type="select"
                  disabled={!canEdit}
                  placeholder="—"
                  options={[
                    { value: "__none__", label: t("tasks.sidebar.none") },
                    ...STORY_POINT_OPTIONS.map((p) => ({ value: String(p), label: String(p) })),
                  ]}
                  renderDisplay={(v) => (v != null && String(v) !== "" ? `${v} pts` : null)}
                />
              </SidebarRow>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
