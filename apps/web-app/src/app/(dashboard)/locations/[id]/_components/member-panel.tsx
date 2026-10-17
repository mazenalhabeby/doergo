"use client"

// One person in the workspace, moved here unchanged out of members-people.tsx.

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { type LocationAssignment, rateHistoryApi, spaceMembersApi } from "@/lib/api"
import {
  personInitials,
  personName,
  jobTitleOf,
  mayGrantSpaceRoles,
  mayManageSpaceMembers,
  type SpaceMember,
  type SpaceRoleInSpace,
} from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DatedRateField } from "@/components/rates/dated-rate"
import { MemberRoutingEditor } from "./member-routing-editor"
import { MemberAutoClock } from "./member-auto-clock"
import { MemberPermissions } from "./member-permissions"
import {
  BILL_BY,
  roleQueryKey,
  Segmented,
  useBillByLabel,
  useCents,
  useSpaceCurrency,
  type BillBy,
} from "./work-roles"
import { NONE } from "./members-people-helpers"
import { useMemberPanel } from "./use-member-panel"
import { CostFromProfile } from "./member-panel-helpers"
import { MemberPanelMembers } from "./member-panel-members"
export { CostFromProfile } from "./member-panel-helpers"

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
      <MemberPanelMembers vm={vm} member={member} spaceId={spaceId} isClient={isClient} autoClockRow={autoClockRow} autoClockWorkspace={autoClockWorkspace} roster={roster} />
    </Sheet>
  )
}
