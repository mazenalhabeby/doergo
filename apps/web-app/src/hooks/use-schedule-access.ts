"use client"

import { NAV_OPTION } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"

/**
 * May this person open Schedule & Time Off?
 *
 * One answer for every way in — the navbar entry, the calendar's Team button and
 * the "Open in Schedule" link on a leave — so a link is never offered to a page
 * that would refuse it. Two halves: the permission the page reads with, and the
 * Shift Scheduling Option the organization bought.
 */
export function useScheduleAccess(): boolean {
  const { user, hasPlanFeature } = useAuth()
  if (!user) return false
  const option = NAV_OPTION["/schedule"]
  return (user.canViewAllTasks === true || user.canManageRota === true) && (!option || hasPlanFeature(option))
}
