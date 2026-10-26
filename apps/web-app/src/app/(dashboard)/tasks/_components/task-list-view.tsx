"use client"

import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"

import type { Task } from "@/lib/api"
import { cn } from "@/lib/utils"
import { TaskTableRow, TASK_ROW_GRID } from "./task-table-row"
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
    <div data-tour="tasks-list" className="rounded-[24px] bg-card px-2 pb-2.5 pt-2 shadow-shell">
      {/* Header */}
      <div
        className={cn(
          "grid items-center gap-3 px-2.5 pb-1.5 pt-2.5 text-[13px] font-semibold text-muted-foreground",
          TASK_ROW_GRID,
        )}
      >
        <div />
        <span>{t("tasks.columns.dueDate")}</span>
        <span>
          {t("tasks.columns.title")} · {t("tasks.columns.priority")}
        </span>
        <span>{t("common.status")}</span>
        <span>{t("tasks.columns.assignee")}</span>
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
