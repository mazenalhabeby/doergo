"use client"

import { assigneeIds } from "@/lib/task-assignment"
import type { useTaskDetailPage } from "./use-task-detail-page"

/** What TaskDetailPage works out after its early returns, moved here unchanged; called from the same place. */
export function TaskDetailPageView({ id, user, task, isCompleted }: { id: ReturnType<typeof useTaskDetailPage>['id']; user: ReturnType<typeof useTaskDetailPage>['user']; task: NonNullable<ReturnType<typeof useTaskDetailPage>['task']>; isCompleted: ReturnType<typeof useTaskDetailPage>['isCompleted'] }) {
  const comments = task.comments || []
  const checklistDone = task.checklistItems?.filter((i) => i.isCompleted).length ?? 0
  const checklistTotal = task.checklistItems?.length ?? 0
  const depCount = (task.predecessors?.length || 0) + (task.successors?.length || 0)
  const subtaskCount = task.subtasks?.length ?? task._count?.subtasks ?? 0
  const attachmentCount = task.attachments?.length ?? 0

  /**
   * Which sections open on arrival.
   *
   * A section you can ADD to always renders — hiding an empty checklist would
   * remove the only way to create the first item — but it arrives collapsed
   * when there is nothing in it, so the page is quiet without becoming a dead
   * end. Sections you can only READ are hidden outright when empty, below.
   *
   * Every count here comes from the task response the page already has, so
   * deciding this costs no request; and a collapsed section no longer mounts
   * its body, so it costs no query either.
   */
  const openIfPresent = (n: number) => n > 0
  const onTheJob = !!user?.id && assigneeIds(task).includes(user.id)

  return {
    comments,
    checklistDone,
    checklistTotal,
    depCount,
    subtaskCount,
    attachmentCount,
    openIfPresent,
    onTheJob,
  }
}
