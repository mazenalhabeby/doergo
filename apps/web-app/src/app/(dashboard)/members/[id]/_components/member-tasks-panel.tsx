"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { type Task } from "@/lib/api"
import { TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { TasksTab } from "./tasks-tab"

interface MemberTasksPanelProps {
  fullTasks: Task[] | undefined
  tasksPage: number
  setTasksPage: Dispatch<SetStateAction<number>>
  /** How many tasks one page holds — a full page means there may be a next one. */
  tasksPageSize: number
}

/** The member page's Tasks tab: one page of their tasks, with Previous / Next. */
export function MemberTasksPanel({ fullTasks, tasksPage, setTasksPage, tasksPageSize }: MemberTasksPanelProps) {
  const { t } = useTranslation()
  return (
    <TabsContent value="tasks" className="mt-6">
      <TasksTab tasks={fullTasks} />
      {(tasksPage > 1 || (fullTasks?.length ?? 0) >= tasksPageSize) && (
        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={tasksPage <= 1}
            onClick={() => setTasksPage((p) => Math.max(1, p - 1))}
          >
            {t("common.previous")}
          </Button>
          <span className="text-xs text-muted-foreground">{tasksPage}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={(fullTasks?.length ?? 0) < tasksPageSize}
            onClick={() => setTasksPage((p) => p + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      )}
    </TabsContent>
  )
}
