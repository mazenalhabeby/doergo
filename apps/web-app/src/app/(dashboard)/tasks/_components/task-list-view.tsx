"use client"

import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"

import type { Task } from "@/lib/api"
import { TaskTableRow } from "./task-table-row"
import type { GroupByOption } from "./grouped-list"
import type { TaskViewContext } from "../_lib/task-list"

// Lazy (audit T-C1): only rendered when a grouping is chosen.
const GroupedList = dynamic(() => import("./grouped-list").then((m) => m.GroupedList), { ssr: false })

/** List View — a flat table, or grouped (replaces the table when a group is active). */
export function TaskListView({
  tasks,
  groupBy,
  canAssign,
  onAssign,
  onGroupChange,
  onReorder,
  onCreateSprint,
  onCreateEpic,
  context: { sprints, phases, epics, spaces, contextActions, recentAssignees },
}: {
  tasks: Task[]
  groupBy: GroupByOption
  canAssign: boolean
  onAssign: (taskId: string) => void
  onGroupChange: (taskId: string, updates: Record<string, string | null>) => void
  onReorder: (taskId: string, newPosition: number, groupKey: string) => void
  onCreateSprint: () => void
  onCreateEpic: () => void
  context: TaskViewContext
}) {
  const { t } = useTranslation()

  if (groupBy !== "none") {
    return (
          <GroupedList
            tasks={tasks}
            groupBy={groupBy}
            sprints={sprints}
            epics={epics}
            spaces={spaces}
            canAssign={canAssign}
            onAssign={onAssign}
            onGroupChange={onGroupChange}
            onReorder={onReorder}
            onCreateSprint={onCreateSprint}
            onCreateEpic={onCreateEpic}
            contextActions={contextActions}
            phases={phases}
            recentAssignees={recentAssignees}
          />
    )
  }

  return (
          <div data-tour="tasks-list" className="bg-card rounded-xl border border-border/50 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[24px_1fr_100px_160px_110px_110px_40px] items-center px-3 py-2 border-b border-border/40">
              <div />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.columns.title")}</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.columns.priority")}</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.columns.assignee")}</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.columns.dueDate")}</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("common.status")}</span>
              <div />
            </div>

            {tasks.map((task: Task, index: number) => (
              <TaskTableRow
                key={task.id}
                task={task}
                index={index}
                canAssign={canAssign}
                onAssign={onAssign}
                sprints={sprints}
                phases={phases}
                epics={epics}
                spaces={spaces}
                contextActions={contextActions}
                recentAssignees={recentAssignees}
              />
            ))}
          </div>
  )
}
