"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useOverflowNav } from "@/hooks/use-overflow-nav"
import { AnimatedLogo } from "@hbcfield/shared/components"
import { personInitials, personName, NAV_OPTION } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { mayListOrgMembers } from "@/lib/assignable-members"
import { useScheduleAccess } from "@/hooks/use-schedule-access"
import { useRouteAccess } from "@/hooks/use-route-access"
import { NotificationBell } from "@/components/notification-bell"
import { SupportButton } from "@/components/support/support-widget"
import { ClockWidget } from "@/components/clock-widget"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useSyncLocale } from "@/hooks/use-sync-locale"
import { HelpButton } from "@/components/tour"
import { cn } from "@/lib/utils"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { isActive } from "./top-navbar/nav-active"
import { navItemBase, navItemInactive, navItemActiveStyle, bottomIndicator } from "./top-navbar/nav-styles"
import { usePrefetchRoutes } from "./top-navbar/use-prefetch-routes"
import { CommandPaletteButton } from "./top-navbar/command-palette-button"
import { ApprovalsButton } from "./top-navbar/approvals-button"
import { TeamDropdown } from "./top-navbar/team-dropdown"
import { DocumentsDropdown } from "./top-navbar/documents-dropdown"
import { MeDropdown } from "./top-navbar/me-dropdown"
import { TimeAttendanceDropdown } from "./top-navbar/time-attendance-dropdown"
import { MobileMenu } from "./top-navbar/mobile-menu"
import { MoreDropdown } from "./top-navbar/more-dropdown"
import { UserDropdown } from "./top-navbar/user-dropdown"

// ---------------------------------------------------------------------------
// TopNavbar
// ---------------------------------------------------------------------------
export function TopNavbar() {
  const { user, logout, hasPlanFeature } = useAuth()
  // Notifications are written on the server in the reader's language.
  useSyncLocale()
  /*
    One question, asked of one table.

    `NAV_OPTION` says which href belongs to which Option; anything it does not
    claim is not an Option and stays visible. `hasPlanFeature` is the same check
    the pages and PlanGate already use, so what the navigation shows and what the
    page allows cannot disagree.
  */
  const optionAllows = useCallback(
    (href: string) => {
      const option = NAV_OPTION[href]
      return !option || hasPlanFeature(option)
    },
    [hasPlanFeature],
  )
  const scheduleAccess = useScheduleAccess()
  const routeAccess = useRouteAccess()
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const prefetch = usePrefetchRoutes(mayListOrgMembers(user))
  const { t, i18n } = useTranslation()

  // Measured overflow for the navigation row (see hooks/use-overflow-nav).
  // Re-measures whenever the language changes, because that changes every width.
  const { containerRef: navRef, overflow: navOverflow } = useOverflowNav(i18n.language)

  if (!user || !routeAccess.nav) return null

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
  // Overflow items go into "More" menu
  return (
    /*
      Two rows, because one was a fight the navigation kept losing.
      Row 1 — who you are, what you're looking for, what needs you now.
      Row 2 — where you can go, with the WHOLE width to itself.

      The single row carried eleven links and seven controls in 56px. Labels are
      written by translators ("Time & Attendance" is 17 characters; "Personale e
      presenze" is 19), so it overflowed in some language at any width, and the
      previous fixes each failed visibly: a breakpoint was wrong in Spanish, and
      scrolling clipped a label mid-word with nothing to say more existed.
      Giving navigation its own row removes the competition instead of rationing it.
    */
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
      {/* ── Row 1 ─────────────────────────────────────────────────────────── */}
      <div className={cn(PAGE_WIDTH, "flex h-12 items-center gap-4")}>
      {/* Logo */}
      <Link
        href="/dashboard"
        className="flex shrink-0 items-center transition-opacity hover:opacity-80"
      >
        <AnimatedLogo size="small" textColor={resolvedTheme === 'dark' ? '#fafafa' : '#18181b'} />
      </Link>


      {/* Everything sits right in row 1. It can: the only thing on the left is the
          logo, so there is no navigation to crowd — that lives in row 2. Order runs
          from "looking something up" through "doing something" to "who am I". */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <CommandPaletteButton />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <LanguageSwitcher />
        <span data-tour="nav-help" className="inline-flex"><HelpButton /></span>
        <span data-tour="nav-support" className="inline-flex"><SupportButton /></span>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ClockWidget />
        <span data-tour="nav-approvals" className="inline-flex"><ApprovalsButton /></span>
        <span data-tour="nav-notifications" className="inline-flex"><NotificationBell /></span>
        <span data-tour="nav-profile" className="inline-flex"><UserDropdown
          user={user}
          initials={initials}
          fullName={fullName}
          avatarUrl={user.avatarUrl}
          canManageUsers={user.canManageUsers}
          onLogout={logout}
        /></span>
      </div>
      </div>

      {/* ── Row 2 — navigation, with the full width to itself ─────────────── */}
      <div className={cn(PAGE_WIDTH, "flex h-11 items-center border-t border-border/50")}>
      {/* Mobile hamburger menu */}
      <MobileMenu
        pathname={pathname}
        showTeam={showTeam}
        showSpaces={showSpaces}
        showSchedule={showSchedule}
        showAttendance={showAttendance}
        showOvertime={showOvertime}
        showIssues={showIssues}
        showReports={showReports}
        showInvoices={showInvoices}
        showManage={showManage}
        teamItems={teamItems}
        showCrm={showCrm}
        showCalendar={showCalendar}
        showAssets={showAssets}
        showPortals={showPortals}
        showMyDocuments={showMyDocuments}
        showIssueDocuments={showIssueDocuments}
        showDocumentTemplates={showDocumentTemplates}
        showDocumentCompliance={showDocumentCompliance}
      />

      {/* Desktop Navigation */}
      {/* xl, not lg. At 1024px the full bar does not fit once the labels are real
          words in a real language: the Spanish set alone needs ~880px before the
          logo, search, clock, language, bell, help, support and avatar on the
          right. 1024–1280px now uses the hamburger, which carries every item.
          (The `MoreDropdown` overflow path below never ran — `overflowItems` is
          initialised empty and never populated, so `hasOverflow` is always false.) */}
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
            isActive(pathname, "/dashboard")
              ? cn(navItemActiveStyle, bottomIndicator)
              : navItemInactive,
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
            isActive(pathname, "/tasks")
              ? cn(navItemActiveStyle, bottomIndicator)
              : navItemInactive,
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
              isActive(pathname, "/calendar")
                ? cn(navItemActiveStyle, bottomIndicator)
                : navItemInactive,
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
              isActive(pathname, "/clients")
                ? cn(navItemActiveStyle, bottomIndicator)
                : navItemInactive,
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
              isActive(pathname, "/locations")
                ? cn(navItemActiveStyle, bottomIndicator)
                : navItemInactive,
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
            className={cn(navItemBase, isActive(pathname, "/reports") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}
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
            className={cn(navItemBase, isActive(pathname, "/invoices") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}
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
          <Link href="/manage"
          data-nav-item
          data-nav-href="/manage"
          data-nav-label={t("nav.manage")}
          data-nav-active={isActive(pathname, "/manage")} className={cn(navItemBase, isActive(pathname, "/manage") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}>
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
      </div>
    </header>
  )
}

// TasksDropdown removed — sprints merged into tasks page
