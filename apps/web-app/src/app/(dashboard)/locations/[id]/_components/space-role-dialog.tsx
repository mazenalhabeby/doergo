"use client"

import { type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { Dialog } from "@/components/ui/dialog"
import { useRoleDialog } from "./use-role-dialog"
import { RoleDialogRoles } from "./role-dialog-roles"
export { SPACE_PERMISSION_DOMAINS } from "./role-dialog-helpers"
export { SPACE_PERMISSIONS, emptyPermissions } from "./use-role-dialog"

/** Create or edit a workspace role and its permissions — moved here unchanged. */
export function RoleDialog({
  spaceId,
  allRoles,
  role,
  defaultKind,
  open,
  onOpenChange,
}: {
  spaceId: string
  /** Every role in the company — a name that exists is offered, not made twice. */
  allRoles: SpaceRoleInSpace[]
  role: SpaceRoleInSpace | null
  defaultKind: "WORK" | "MANAGEMENT"
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const vm = useRoleDialog({ spaceId, allRoles, role, defaultKind, open, onOpenChange })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <RoleDialogRoles vm={vm} role={role} spaceId={spaceId} onOpenChange={onOpenChange} />
    </Dialog>
  )
}
