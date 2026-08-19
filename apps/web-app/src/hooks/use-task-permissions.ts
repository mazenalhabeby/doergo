"use client"

import { useMemo } from "react"

import { accessAllowsInSpace } from "@hbcfield/shared/client"

import { useAuth } from "@/contexts/auth-context"

/**
 * What the current user may do to a given task.
 *
 * Mirrors the server, which is the only rule that counts. A mutation on a task
 * passes when the caller is an ADMIN, holds the permission as a flat org flag,
 * or holds it in that task's space — `RequirePermissionInSpace` widens on the
 * gateway and `accessAllowsInSpace` re-checks the real spaceId in the service.
 *
 * The screens used to guess. The detail page gated Edit and Assign on
 * `canViewAllTasks`, which is neither of the permissions the server checks: a
 * manager who can see every task but create none was shown an Edit button that
 * 403'd on save, while a member who genuinely held `canCreateTasks` was refused
 * a button the server would have accepted. The list page gated the same two
 * actions on different flags again. One hook, so a button appears exactly when
 * the action behind it will succeed.
 */
export interface TaskPermissionSubject {
  /** The space the task lives in — permissions are resolved per space. */
  spaceId?: string | null
  /** Terminal tasks are read-only regardless of permission. */
  isFinished?: boolean
}

export interface TaskPermissions {
  /** Edit fields, move between spaces/sprints, change the title. */
  canEdit: boolean
  /** Add or remove assignees. */
  canAssign: boolean
  /** Open the assignee picker — needs the worker directory as well. */
  canPickAssignee: boolean
  /** Cancel the task. */
  canCancel: boolean
  /** ADMIN, or granted view-all: reaches every task in the org. */
  canViewAll: boolean
}

export function useTaskPermissions(task?: TaskPermissionSubject | null): TaskPermissions {
  const { user } = useAuth()

  return useMemo(() => {
    const isAdmin = user?.role === "ADMIN"
    const spaceId = task?.spaceId ?? undefined
    const access = (user as { access?: unknown } | null)?.access

    /** Org-wide flag OR the permission in this task's space — the server's rule. */
    const holds = (key: "canCreateTasks" | "canAssignTasks") =>
      isAdmin ||
      (user as Record<string, unknown> | null)?.[key] === true ||
      accessAllowsInSpace(access as never, key, spaceId)

    const canViewAll = isAdmin || user?.canViewAllTasks === true
    const editable = !task?.isFinished

    const canEdit = holds("canCreateTasks") && editable
    const canAssign = holds("canAssignTasks") && editable

    return {
      canEdit,
      canAssign,
      // The picker lists the org's workers, and that endpoint requires
      // canViewAllTasks. Without it the picker opens onto a 403 and an empty
      // list with no explanation, so it stays shut.
      canPickAssignee: canAssign && canViewAll,
      // Cancelling is an edit of the most destructive kind — same permission.
      canCancel: canEdit,
      canViewAll,
    }
  }, [user, task?.spaceId, task?.isFinished])
}
