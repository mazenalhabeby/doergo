"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { type LocationAssignment, rateHistoryApi, spaceMembersApi } from "@/lib/api"
import {
  mayGrantSpaceRoles,
  mayManageSpaceMembers,
  type SpaceMember,
  type SpaceRoleInSpace,
} from "@hbcfield/shared/client"
import { roleQueryKey, useBillByLabel, useCents, useSpaceCurrency, type BillBy } from "./work-roles"

/** MemberPanel's state and handlers — everything before its markup, moved here unchanged. */
export function useMemberPanel({
  spaceId,
  member,
  roles,
  roster,
  isClient,
  autoClockRow,
  autoClockWorkspace,
  onClose,
}: Pick<{
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
}, 'spaceId' | 'member' | 'roles' | 'roster' | 'isClient' | 'autoClockRow' | 'autoClockWorkspace' | 'onClose'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const billByLabel = useBillByLabel()
  const money = useSpaceCurrency(spaceId)
  const cents = useCents(money.bill)
  const { user } = useAuth()
  const canViewLabourCost = (user as { canViewLabourCost?: boolean } | null)?.canViewLabourCost === true
  const [confirmRemove, setConfirmRemove] = useState(false)

  const external = member?.user?.isExternal === true
  /*
    Giving roles here — the same rule as the server's builder routes
    (`spaceMemberAuthority().grantRoles`): managing this workspace's people, or
    `canGrantSpaceRoles` here or org-wide (workspaces administrators and admins
    included). For an external member the builder REPLACES the role picker:
    their whole authority is what they may do in this one workspace.
  */
  const mayGrant = !!user && (mayManageSpaceMembers(user, spaceId) || mayGrantSpaceRoles(user, spaceId))
  const builderReplacesPicker = external && mayGrant
  // Only the trades this workspace uses — plus the one this person already holds.
  const workRoles = roles.filter((r) => r.kind === "WORK" && (r.activeHere !== false || r.id === member?.workRole?.id))
  const mgmtRoles = roles.filter((r) => r.kind !== "WORK")
  const allow = member?.allowSecondRole === true
  const hasWork = !!member?.workRole
  const hasMgmt = !!member?.spaceRole
  // The management slot is open when nothing else is held, or two roles are allowed.
  const mgmtOpen = !hasWork || allow || hasMgmt
  const workOpen = !external && (!hasMgmt || allow || hasWork)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
    queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
  }
  const update = useMutation({
    mutationFn: (data: Parameters<typeof spaceMembersApi.updateRoles>[2]) => spaceMembersApi.updateRoles(spaceId, member!.id, data),
    onSuccess: () => { invalidate(); notify.success(t("scheduling.workRoles.memberSaved")) },
    onError: (e: Error) => notify.error(e.message),
  })
  const remove = useMutation({
    mutationFn: () => spaceMembersApi.remove(spaceId, member!.id),
    onSuccess: () => { invalidate(); notify.success(t("scheduling.members.toast.removed")); setConfirmRemove(false); onClose() },
    onError: (e: Error) => notify.error(e.message),
  })
  const { data: rates } = useQuery({
    queryKey: keys.rates.history("ASSIGNMENT", member?.id),
    queryFn: () => rateHistoryApi.list({ target: "ASSIGNMENT", targetId: member!.id, spaceId }),
    enabled: !!member && isClient && !external,
  })
  const saveRate = async (patch: { billRateCents?: number | null }, from?: string) => {
    await spaceMembersApi.updateRate(spaceId, member!.id, { ...patch, ...(from ? { effectiveFrom: from } : {}) })
    invalidate()
    queryClient.invalidateQueries({ queryKey: keys.rates.history("ASSIGNMENT", member!.id) })
  }

  const workRole = member?.workRole ? roles.find((r) => r.id === member.workRole!.id) : undefined
  const bill = (member?.effectiveBillBy ?? "HOUR") as BillBy
  const section = "space-y-3 border-t pt-4 first:border-t-0 first:pt-0"
  const heading = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"

  return {
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
  }
}

/** What MemberPanel and its sections read. */
export type MemberPanelState = ReturnType<typeof useMemberPanel>
