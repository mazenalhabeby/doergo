"use client"

import { personInitials, personName } from "@hbcfield/shared/client"
import type { useTopNavbar } from "./use-top-navbar"

/** What TopNavbar works out after its early returns, moved here unchanged; called from the same place. */
export function TopNavbarView({ user, optionAllows, scheduleAccess, routeAccess }: { user: NonNullable<ReturnType<typeof useTopNavbar>['user']>; optionAllows: ReturnType<typeof useTopNavbar>['optionAllows']; scheduleAccess: ReturnType<typeof useTopNavbar>['scheduleAccess']; routeAccess: ReturnType<typeof useTopNavbar>['routeAccess'] }) {
  const initials = personInitials(user)
  const fullName = personName(user)

  /*
    Every item is asked of ONE table — lib/route-access — which mirrors the
    gateway guard behind each page, the Option that owns it and the module it
    needs. The bar, the dashboard layout (which refuses a typed URL the same
    way), the settings list and the Manage hub all read it, so an entry here
    can no longer lead to a page whose every request 403s.

    The Team menu was the worst case: it opened for `canManageUsers ||
    canViewAllTasks`, and every page in it needs canManageUsers — so a
    dispatcher got three links to three refusals. It now lists exactly the
    pages each person can use.
  */
  const nav = routeAccess.nav!
  const teamItems = nav.team
  const showTeam = teamItems.length > 0
  const showSpaces = nav.spaces
  const showSchedule = scheduleAccess
  const showAttendance = nav.time.includes("/attendance")
  const showOvertime = nav.time.includes("/overtime") && optionAllows("/overtime")
  const showIssues = nav.time.includes("/issues")
  const showReports = nav.reports
  const showCalendar = nav.calendar
  const showCrm = nav.clients
  const showAssets = nav.assets
  const showPortals = nav.portals
  const showInvoices = nav.invoices && optionAllows("/invoices")
  const docs = nav.documents
  const showIssueDocuments = docs.includes("/documents")
  const showAllDocuments = docs.includes("/documents/all")
  const showDocumentTypes = docs.includes("/documents/types")
  const showDocumentTemplates = docs.includes("/documents/templates")
  const showDocumentCompliance = docs.includes("/documents/compliance")
  const showMyDocuments = docs.length > 0

  // "Manage" is the management hub — redundant with "Team", so the table shows
  // it only to whoever has no Team menu.
  const showManage = nav.manage

  return {
    initials,
    fullName,
    nav,
    teamItems,
    showTeam,
    showSpaces,
    showSchedule,
    showAttendance,
    showOvertime,
    showIssues,
    showReports,
    showCalendar,
    showCrm,
    showAssets,
    showPortals,
    showInvoices,
    showIssueDocuments,
    showAllDocuments,
    showDocumentTypes,
    showDocumentTemplates,
    showDocumentCompliance,
    showMyDocuments,
    showManage,
  }
}
