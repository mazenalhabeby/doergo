"use client"

import { useRouteAccess } from "@/hooks/use-route-access"

/**
 * May this person open Schedule & Time Off?
 *
 * One answer for every way in — the navbar entry, the calendar's Team button and
 * the "Open in Schedule" link on a leave — so a link is never offered to a page
 * that would refuse it. Asked of the route table (lib/route-access), whose
 * `/schedule` entry carries both halves: the permission the page
 * reads with, and the Shift Scheduling Option (`NAV_OPTION["/schedule"]`).
 */
export function useScheduleAccess(): boolean {
  return useRouteAccess().offers("/schedule")
}
