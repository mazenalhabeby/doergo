import type { Task } from "@/lib/api"

/**
 * Is this task assigned to `userId`?
 *
 * A task carries its assignment TWICE: `assignedToId` (the lead / legacy single
 * assignee) and an `assignees[]` list for multi-assignment. The API returns a
 * member's tasks using both — `{ OR: [{ assignedToId }, { assignees: { some }}] }` —
 * so any client that filters on `assignedToId` alone silently drops the tasks a
 * member holds as a co-assignee rather than as lead.
 *
 * Use this anywhere "is it theirs?" is asked, so the two sides can't disagree.
 */
export function isAssignedTo(task: Task, userId?: string | null): boolean {
  if (!userId) return false
  if (task.assignedToId === userId) return true
  return (task.assignees ?? []).some((a) => (a.userId ?? a.user?.id) === userId)
}

/** Every user id a task is assigned to (lead + co-assignees), de-duplicated. */
export function assigneeIds(task: Task): string[] {
  const ids = new Set<string>()
  if (task.assignedToId) ids.add(task.assignedToId)
  for (const a of task.assignees ?? []) {
    const id = a.userId ?? a.user?.id
    if (id) ids.add(id)
  }
  return [...ids]
}
