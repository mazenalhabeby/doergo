"use client"

import { roleBadge } from "@/lib/role-badge"
import type { useMemberProfilePage } from "./use-member-profile-page"

/** What MemberProfilePage works out after its early returns, moved here unchanged; called from the same place. */
export function MemberProfilePageView({ t, member }: { t: ReturnType<typeof useMemberProfilePage>['t']; member: NonNullable<ReturnType<typeof useMemberProfilePage>['member']> }) {
  /* Works for a client or partner — see the tab list below for what that hides. */
  const isExternalMember = member.isExternal === true
  const roleConfig = roleBadge(member.role, { isExternal: member.isExternal })
  const scheduleLabel = member.scheduleType === "FIXED"
    ? t("members.detail.fixedSchedule")
    : member.scheduleType === "FLEXIBLE"
      ? t("members.detail.flexibleHours")
      : null

  return { isExternalMember, roleConfig, scheduleLabel }
}
