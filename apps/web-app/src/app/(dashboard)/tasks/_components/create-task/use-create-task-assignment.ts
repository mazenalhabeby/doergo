"use client"

import { useState, useMemo, useEffect } from "react"
import { byAssignableFirst } from "@hbcfield/shared/client"
import { useAssignableMembers } from "@/hooks/use-assignable-members"
import { useWorkspaceWorkRoles } from "@/hooks/use-workspace-work-roles"
import type { useAuth } from "@/contexts/auth-context"
import { type RoleAssignValue } from "../role-assign-field"
import type { AssigneeOption } from "./create-task-types"

type Auth = ReturnType<typeof useAuth>

/**
 * Who a new task is for — moved here unchanged from useCreateTaskForm, which calls this at
 * the same point, so the same hooks run in the same order.
 */
export function useCreateTaskAssignment({
  open,
  user,
  hasPermission,
  spaceId,
  isRecurring,
}: {
  open: boolean
  user: Auth["user"]
  hasPermission: Auth["hasPermission"]
  spaceId: string
  isRecurring: boolean
}) {
  /*
    Who the task is being assigned to.

    The picker below had no `value` and no `onValueChange` — an uncontrolled
    Select that stored nothing. You chose a member, the dialog forgot it, and
    the task was created unassigned, so the only way to assign anyone was to
    open the task afterwards and do it again.
  */
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  /*
    People, or a work role (shared tasks/role-pool.ts): "a Mechanic" instead of
    "Ahmad". Only inside a workspace — a role is a fact about a workspace — and
    only for a one-off task.
  */
  const [assignMode, setAssignMode] = useState<"people" | "role">("people")
  const [openRole, setOpenRole] = useState<RoleAssignValue>({ roleId: null, spots: 1 })

  // ── Fetch members for assignee picker ──
  const taskCreationScope = user?.taskCreationScope || "NONE"
  const isSelfScope = taskCreationScope === "SELF"
  /*
    Creating is not assigning.

    Both are needed to offer this control. A creation scope of SPACE says WHERE
    somebody may open a task, not that they may hand it to anyone — an External
    Observer holds `canCreateTasks` through a space role, which resolves to
    SPACE, and would have been shown a picker whose value the server strips.

    `hasPermission` is space-aware, matching what the create route accepts.
  */
  const canAssign = user?.role === "ADMIN" || hasPermission("canAssignTasks")
  const showAssigneePicker = canAssign && (taskCreationScope === "SPACE" || taskCreationScope === "ORG")
  // A role belongs to a workspace and a one-off task — and only where that workspace HAS work roles.
  const roleCandidate = showAssigneePicker && spaceId !== "none" && !isRecurring
  const { hasRoles: spaceHasRoles } = useWorkspaceWorkRoles(spaceId !== "none" ? spaceId : null, roleCandidate)
  const roleModeAvailable = roleCandidate && spaceHasRoles
  // A role is a fact about ONE workspace: another workspace starts the choice again.
  useEffect(() => {
    setOpenRole((r) => (r.roleId ? { ...r, roleId: null } : r))
  }, [spaceId])

  /*
    Who can be given this work.

    The WORKSPACE's roster when one is chosen, and the organization directory
    only when none is. Two reasons, and the first is why the picker came up
    empty for a site supervisor:

      • `GET /organizations/members` is `@RequirePermission('canManageUsers')`
        — a permission an external member can never hold, and a space-scoped
        manager holds org-wide only if somebody made them an admin. The request
        403s, the list renders empty, and the dialog offers a control that
        cannot be used. `GET /locations/:id/members` needs no permission: it is
        a space's own roster, org-scoped in the service.

      • It is the better answer anyway. Work at a site goes to the people at
        that site, and the roster is a handful of rows rather than a directory
        truncated at fifty — beyond which a member simply could not be picked.
  */
  // "none" is this dialog's unset sentinel, not an empty string.
  const hasSpace = !!spaceId && spaceId !== "none"
  // No workspace chosen: the directory for whoever may read it, otherwise the
  // rosters of the workspaces this person can see (lib/assignable-members.ts).
  const { members: assignable } = useAssignableMembers({
    spaceId: hasSpace ? spaceId : null,
    rosterOnly: true,
    enabled: open && showAssigneePicker,
  })
  const members: AssigneeOption[] = useMemo(() => [...assignable].sort(byAssignableFirst), [assignable])

  return {
    assigneeIds,
    setAssigneeIds,
    assignMode,
    setAssignMode,
    openRole,
    setOpenRole,
    isSelfScope,
    showAssigneePicker,
    roleModeAvailable,
    members,
  }
}
