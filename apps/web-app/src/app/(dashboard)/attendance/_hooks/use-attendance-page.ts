"use client"

import { keys } from "@/lib/query-keys"
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { attendanceApi } from "@/lib/api"
import { useTranslation } from "react-i18next"

/** The attendance page's own state: who may do what here, the open tab, the open no-show count. */
export function useAttendancePage() {
  const { user, hasPermission } = useAuth()
  const { t } = useTranslation()

  // Tab state
  const [activeTab, setActiveTab] = useState<"tracking" | "breaks" | "noshows">("tracking")

  // Honor a ?tab= deep-link (e.g. the dashboard's "Pending Actions" reject link
  // → /attendance?tab=approvals). Read after mount to avoid a hydration mismatch.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab")
    // Hours are decided in Approvals now: an old link to this tab goes there.
    if (tab === "approvals") window.location.replace("/approvals?kind=hours")
    else if (tab === "breaks" || tab === "tracking" || tab === "noshows") setActiveTab(tab)
  }, [])

  // Check role - only ADMIN and DISPATCHER can access
  const canAccess =
    user?.role === "ADMIN" || hasPermission("canViewSpaceAttendance") || hasPermission("canViewAllTasks")
  const isAdmin = user?.role === "ADMIN"
  /*
    Correcting somebody else's shift — editing the times, adding a break they
    could not record themselves.

    Separate from `isAdmin`, which on this page still gates worklog editing.
    The server accepts `canReconcileAttendance` for these
    corrections precisely so the person who runs payroll can hold it without
    being handed the organization — and a UI that only offers them to admins
    makes that grant unreachable, which is how a permission quietly becomes
    decorative.
  */
  const canReconcile = isAdmin || hasPermission("canReconcileAttendance")
  /*
    Erasing is its own permission (`canDeleteAttendance`). Signing hours off
    (`canApproveAttendance`) happens in Approvals, not on this page.
  */
  const canDelete = isAdmin || hasPermission("canDeleteAttendance")
  /*
    A day off is written through POST /time-off/manual — `canManageRota` held ORG-WIDE (clock review C4). The
    buttons were for admins only, and the days-off column header and its cells read two different rules.
  */
  const canManageLeave = mayManageLeave(user)

  // No-shows (shares the tab's query key → deduped) — drives the tab count badge.
  const { data: noShowPeople = [] } = useQuery({
    queryKey: keys.attendance.noShows(),
    queryFn: () => attendanceApi.noShowSummary({ days: 30 }),
    enabled: canAccess,
    staleTime: 30_000,
  })
  const openNoShows = noShowPeople.reduce((n, p) => n + p.open, 0)

  return { t, activeTab, setActiveTab, canAccess, isAdmin, canReconcile, canDelete, canManageLeave, openNoShows }
}

/** May write a day off: `canManageRota` held org-wide, as POST /time-off/manual checks (clock review C4). */
export function mayManageLeave(user: { role?: string; canManageRota?: boolean } | null | undefined): boolean {
  return user?.role === "ADMIN" || user?.canManageRota === true
}
