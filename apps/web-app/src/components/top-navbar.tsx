"use client"

import Link from "next/link"
import { AnimatedLogo } from "@hbcfield/shared/components"
import { NotificationBell } from "@/components/notification-bell"
import { SupportButton } from "@/components/support/support-widget"
import { ClockWidget } from "@/components/clock-widget"
import { LanguageSwitcher } from "@/components/language-switcher"
import { HelpButton } from "@/components/tour"
import { cn } from "@/lib/utils"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { CommandPaletteButton } from "./top-navbar/command-palette-button"
import { ApprovalsButton } from "./top-navbar/approvals-button"
import { MessagesButton } from "./top-navbar/messages-button"
import { MobileMenu } from "./top-navbar/mobile-menu"
import { UserDropdown } from "./top-navbar/user-dropdown"
import { useTopNavbar } from "./use-top-navbar"
import { TopNavbarView } from "./top-navbar-view"
import { TopNavbarSidebar } from "./top-navbar-sidebar"

// ---------------------------------------------------------------------------
// TopNavbar
// ---------------------------------------------------------------------------
export function TopNavbar() {
  const vm = useTopNavbar()
  const {
    user,
    logout,
    optionAllows,
    scheduleAccess,
    routeAccess,
    pathname,
    resolvedTheme,
    prefetch,
    t,
    navRef,
    navOverflow,
  } = vm

  if (!user || !routeAccess.nav) return null

  const {
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
  } = TopNavbarView({ user, optionAllows, scheduleAccess, routeAccess })
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
          <span data-tour="nav-help" className="inline-flex">
            <HelpButton />
          </span>
          <span data-tour="nav-support" className="inline-flex">
            <SupportButton />
          </span>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <ClockWidget />
          <span data-tour="nav-approvals" className="inline-flex">
            <ApprovalsButton />
          </span>
          <span data-tour="nav-messages" className="inline-flex">
            <MessagesButton />
          </span>
          <span data-tour="nav-notifications" className="inline-flex">
            <NotificationBell />
          </span>
          <span data-tour="nav-profile" className="inline-flex">
            <UserDropdown
              user={user}
              initials={initials}
              fullName={fullName}
              avatarUrl={user.avatarUrl}
              canManageUsers={user.canManageUsers}
              onLogout={logout}
            />
          </span>
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
      <TopNavbarSidebar
        vm={vm}
        showCalendar={showCalendar}
        showCrm={showCrm}
        showAssets={showAssets}
        showPortals={showPortals}
        showTeam={showTeam}
        teamItems={teamItems}
        showSpaces={showSpaces}
        showSchedule={showSchedule}
        showAttendance={showAttendance}
        showOvertime={showOvertime}
        showIssues={showIssues}
        showReports={showReports}
        showInvoices={showInvoices}
        showMyDocuments={showMyDocuments}
        showIssueDocuments={showIssueDocuments}
        showAllDocuments={showAllDocuments}
        showDocumentTypes={showDocumentTypes}
        showDocumentTemplates={showDocumentTemplates}
        showDocumentCompliance={showDocumentCompliance}
        showManage={showManage}
      />
      </div>
    </header>
  )
}

// TasksDropdown removed — sprints merged into tasks page
