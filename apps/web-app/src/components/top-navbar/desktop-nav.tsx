"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useOverflowNav } from "@/hooks/use-overflow-nav"
import { cn } from "@/lib/utils"
import { isActive } from "./nav-active"
import { navItemBase, navItemInactive, navItemActiveStyle, bottomIndicator } from "./nav-styles"
import { TeamDropdown } from "./team-dropdown"
import { DocumentsDropdown } from "./documents-dropdown"
import { MeDropdown } from "./me-dropdown"
import { TimeAttendanceDropdown } from "./time-attendance-dropdown"
import { MoreDropdown } from "./more-dropdown"
import { usePrefetchRoutes } from "./use-prefetch-routes"
import type { NavVisibility } from "./nav-visibility"

/**
 * The navigation row at md and up. Whatever does not fit at the current width and language is
 * measured out of the row and collapses into "More".
 */
export function DesktopNav({
  pathname,
  mayListMembers,
  showCalendar,
  showCrm,
  showAssets,
  showPortals,
  showTeam,
  teamItems,
  showSpaces,
  showSchedule,
  showAttendance,
  showOvertime,
  showIssues,
  showReports,
  showInvoices,
  showMyDocuments,
  showIssueDocuments,
  showAllDocuments,
  showDocumentTypes,
  showDocumentTemplates,
  showDocumentCompliance,
  showManage,
}: NavVisibility & {
  pathname: string
  /** May this member read the organization's member list (what Team prefetches)? */
  mayListMembers: boolean
}) {
  const { t, i18n } = useTranslation()
  const prefetch = usePrefetchRoutes(mayListMembers)
  // Measured overflow for the navigation row (see hooks/use-overflow-nav).
  // Re-measures whenever the language changes, because that changes every width.
  const { containerRef: navRef, overflow: navOverflow } = useOverflowNav(i18n.language)
  return (
    <nav
      ref={navRef}
      // justify-center, not mx-auto: the nav still spans the row (flex-1), so the
      // measurement in useOverflowNav keeps reading the full available width —
      // it is the ITEMS that are centred inside it, not the container that shrinks
      // to fit them. Centring by shrinking would make the hook measure only the
      // items it had already decided to show.
      className="hidden md:flex min-w-0 flex-1 items-center justify-center gap-1"
    >
      {/* Dashboard */}
      <Link
        href="/dashboard"
        data-nav-item
        data-nav-href="/dashboard"
        data-nav-label={t("nav.sidebar.dashboard")}
        data-nav-active={isActive(pathname, "/dashboard")}
        data-tour="nav-dashboard"
        onMouseEnter={prefetch.prefetchDashboard}
        className={cn(
          navItemBase,
          isActive(pathname, "/dashboard") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
        )}
      >
        {t("nav.sidebar.dashboard")}
      </Link>

      {/* Tasks — direct link (sprints merged into tasks page) */}
      <Link
        href="/tasks"
        data-nav-item
        data-nav-href="/tasks"
        data-nav-label={t("nav.sidebar.tasks")}
        data-nav-active={isActive(pathname, "/tasks")}
        data-tour="nav-tasks"
        onMouseEnter={prefetch.prefetchTasks}
        className={cn(
          navItemBase,
          isActive(pathname, "/tasks") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
        )}
      >
        {t("nav.sidebar.tasks")}
      </Link>

      {showCalendar && (
        <Link
          href="/calendar"
          data-nav-item
          data-nav-href="/calendar"
          data-nav-label={t("nav.sidebar.calendar")}
          data-nav-active={isActive(pathname, "/calendar")}
          className={cn(
            navItemBase,
            isActive(pathname, "/calendar") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
          )}
        >
          {t("nav.sidebar.calendar")}
        </Link>
      )}

      {/* CRM — a member's assigned clients (server-scoped). Reachable without
          space-manager rights, unlike the per-space Customers tab. */}
      {showCrm && (
        <Link
          href="/clients"
          data-nav-item
          data-nav-href="/clients"
          data-nav-label={t("nav.crm")}
          data-nav-active={isActive(pathname, "/clients")}
          className={cn(
            navItemBase,
            isActive(pathname, "/clients") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
          )}
        >
          {t("nav.crm", "CRM")}
        </Link>
      )}

      {/* Assets — the workspace's Assets tab at its own address. The page
          existed and was linked from nowhere; the only door was Spaces → a
          workspace → Configure → Assets. */}
      {showAssets && (
        <Link
          href="/assets"
          data-nav-item
          data-nav-href="/assets"
          data-nav-label={t("nav.assets", "Assets")}
          data-nav-active={isActive(pathname, "/assets")}
          className={cn(
            navItemBase,
            isActive(pathname, "/assets") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
          )}
        >
          {t("nav.assets", "Assets")}
        </Link>
      )}

      {/* Client portals — likewise. A portal belongs to one workspace, which
          is a fact about the data, not a reason to bury the screen. */}
      {showPortals && (
        <Link
          href="/portals"
          data-nav-item
          data-nav-href="/portals"
          data-nav-label={t("nav.portals", "Portals")}
          data-nav-active={isActive(pathname, "/portals")}
          className={cn(
            navItemBase,
            isActive(pathname, "/portals") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
          )}
        >
          {t("nav.portals", "Portals")}
        </Link>
      )}

      {/* Team dropdown (admins) */}
      {showTeam && <TeamDropdown pathname={pathname} items={teamItems} onOpen={prefetch.prefetchTeam} />}

      {/* Spaces */}
      {showSpaces && (
        <Link
          href="/locations"
          data-nav-item
          data-nav-href="/locations"
          data-nav-label={t("nav.spaces")}
          data-nav-active={isActive(pathname, "/locations")}
          data-tour="nav-spaces"
          onMouseEnter={prefetch.prefetchSpaces}
          className={cn(
            navItemBase,
            isActive(pathname, "/locations") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
          )}
        >
          {t("nav.spaces")}
        </Link>
      )}

      {/* Time & Attendance dropdown (attendance + schedule + personal time-off) */}
      {(showSchedule || showAttendance || showOvertime) && (
        <TimeAttendanceDropdown
          pathname={pathname}
          showSchedule={showSchedule}
          showAttendance={showAttendance}
          showOvertime={showOvertime}
          showIssues={showIssues}
          onOpen={prefetch.prefetchAttendance}
        />
      )}

      {/* B2B "Customers" directory retired — a customer is now a Space of kind
          CUSTOMER (see Spaces). Client portals are managed per-space (Spaces →
          a space → Client portal tab), so there's no top-level nav item. */}

      {/* Reports and Invoices are separate destinations, not one "Ledger". They
          share no workflow: one reads the past, the other bills for it. A
          two-item dropdown also cost a click to reach either. Note the split
          with the avatar menu: this is CUSTOMER billing; the organization's own
          subscription billing lives under the avatar. */}
      {showReports && (
        <Link
          href="/reports"
          data-nav-item
          data-nav-href="/reports"
          data-nav-label={t("nav.reports")}
          data-nav-active={isActive(pathname, "/reports")}
          data-tour="nav-reports"
          className={cn(
            navItemBase,
            isActive(pathname, "/reports") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
          )}
        >
          {t("nav.reports", "Reports")}
        </Link>
      )}
      {showInvoices && (
        <Link
          href="/invoices"
          data-nav-item
          data-nav-href="/invoices"
          data-nav-label={t("nav.sidebar.invoices")}
          data-nav-active={isActive(pathname, "/invoices")}
          data-tour="nav-invoices"
          className={cn(
            navItemBase,
            isActive(pathname, "/invoices") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
          )}
        >
          {t("nav.sidebar.invoices")}
        </Link>
      )}

      {/* Employee module-driven items. Personal Time Off shows standalone only
          when the user has no Time & Attendance dropdown to host it (i.e. a
          non-management member); managers get it inside that dropdown. */}
      <MeDropdown pathname={pathname} />
      {showMyDocuments && (
        <DocumentsDropdown
          pathname={pathname}
          showIssue={showIssueDocuments}
          showAllDocuments={showAllDocuments}
          showTypes={showDocumentTypes}
          showTemplates={showDocumentTemplates}
          showCompliance={showDocumentCompliance}
        />
      )}
      {showManage && (
        <Link
          href="/manage"
          data-nav-item
          data-nav-href="/manage"
          data-nav-label={t("nav.manage")}
          data-nav-active={isActive(pathname, "/manage")}
          className={cn(
            navItemBase,
            isActive(pathname, "/manage") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
          )}
        >
          {t("nav.manage")}
        </Link>
      )}

      {/* Measured overflow — the guarantee. The nav row fits everything at normal
          widths, but Italian needs ~1010px and a 1024px window leaves 976px, so
          whatever does not fit collapses here rather than being clipped. */}
      <span data-nav-more className={navOverflow.length ? "inline-flex" : "hidden"}>
        <MoreDropdown items={navOverflow} pathname={pathname} />
      </span>
    </nav>
  )
}
