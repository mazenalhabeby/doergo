"use client"

// One person in the workspace, moved here unchanged out of members-people.tsx.

import { type LocationAssignment } from "@/lib/api"
import { type SpaceMember, type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { Sheet } from "@/components/ui/sheet"
import { useMemberPanel } from "./use-member-panel"
import { MemberPanelMembers } from "./member-panel-members"

/** Everything about one person in this workspace — what the row only shows. */
export function MemberPanel({
  spaceId,
  member,
  roles,
  roster,
  isClient,
  autoClockRow,
  autoClockWorkspace,
  onClose,
}: {
  spaceId: string
  member: SpaceMember | null
  roles: SpaceRoleInSpace[]
  roster: SpaceMember[]
  isClient: boolean
  /**
   * The automatic clock's roster row for this member. `undefined` = not offered
   * (the workspace has it off, or an external member — they hold no clock);
   * `null` = offered, still loading.
   */
  autoClockRow?: LocationAssignment | null
  autoClockWorkspace: { dwellMinutes: number; exitGraceMinutes: number; noShiftMinutes: number }
  onClose: () => void
}) {
  const vm = useMemberPanel({ spaceId, member, roles, roster, isClient, autoClockRow, autoClockWorkspace, onClose })
  const {
    t,
    billByLabel,
    money,
    cents,
    user,
    canViewLabourCost,
    confirmRemove,
    setConfirmRemove,
    external,
    mayGrant,
    builderReplacesPicker,
    workRoles,
    mgmtRoles,
    allow,
    mgmtOpen,
    workOpen,
    update,
    remove,
    rates,
    saveRate,
    workRole,
    bill,
    section,
    heading,
  } = vm

  return (
    <Sheet open={!!member} onOpenChange={(o) => { if (!o) onClose() }}>
      <MemberPanelMembers
        vm={vm}
        member={member}
        spaceId={spaceId}
        isClient={isClient}
        autoClockRow={autoClockRow}
        autoClockWorkspace={autoClockWorkspace}
        roster={roster}
      />
    </Sheet>
  )
}
