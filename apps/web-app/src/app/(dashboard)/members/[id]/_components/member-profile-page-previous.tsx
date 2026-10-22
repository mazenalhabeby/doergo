"use client"

import { TabsContent } from "@/components/ui/tabs"
import { TasksTab } from "./tasks-tab"
import { Button } from "@/components/ui/button"
import { TASKS_PAGE_SIZE } from "./member-profile-page-helpers"
import type { MemberProfilePageState } from "../_hooks/use-member-profile-page"

/** Part of MemberProfilePage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MemberProfilePagePrevious({ vm }: { vm: MemberProfilePageState }) {
  const {
    fullTasks,
    tasksPage,
    setTasksPage,
    t,
    memberLoading,
    memberError,
    member,
    canViewOps,
  } = vm
  if ((memberLoading)) return null
  if ((memberError)) return null
  if ((!member)) return null
  if (!(canViewOps)) return null
  return (
    <TabsContent value="tasks" className="mt-6">
      <TasksTab tasks={fullTasks} />
      {(tasksPage > 1 || (fullTasks?.length ?? 0) >= TASKS_PAGE_SIZE) && (
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
            disabled={(fullTasks?.length ?? 0) < TASKS_PAGE_SIZE}
            onClick={() => setTasksPage((p) => p + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      )}
    </TabsContent>
  )
}
