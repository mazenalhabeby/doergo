"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useCallback } from "react"
import { NAV_OPTION, personInitials, personName } from "@hbcfield/shared/client"
import { AnimatedLogo } from "@hbcfield/shared/components"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SupportButton } from "@/components/support/support-widget"
import { ClockWidget } from "@/components/attendance/clock-widget"
import { LanguageSwitcher } from "@/components/app-shell/language-switcher"
import { HelpButton } from "@/components/tour"
import { cn } from "@/lib/utils"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { CommandPaletteButton } from "./command-palette-button"
import { ApprovalsButton } from "./approvals-button"
import { MessagesButton } from "./messages-button"
import { MobileMenu } from "./mobile-menu"
import { UserDropdown } from "./user-dropdown"
import { useAuth } from "@/contexts/auth-context"
import { mayListOrgMembers } from "@/lib/assignable-members"
import { useScheduleAccess } from "@/hooks/use-schedule-access"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useSyncLocale } from "@/hooks/use-sync-locale"
import { navVisibility } from "./nav-visibility"
import { DesktopNav } from "./desktop-nav"

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

  if (!user || !routeAccess.nav) return null

  const initials = personInitials(user)
  const fullName = personName(user)
  const visible = navVisibility(routeAccess.nav, scheduleAccess, optionAllows)
  const {
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
    showDocumentTemplates,
    showDocumentCompliance,
    showMyDocuments,
    showManage,
  } = visible
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
        <Link href="/dashboard" className="flex shrink-0 items-center transition-opacity hover:opacity-80">
          <AnimatedLogo size="small" textColor={resolvedTheme === "dark" ? "#fafafa" : "#18181b"} />
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
        <DesktopNav pathname={pathname} mayListMembers={mayListOrgMembers(user)} {...visible} />
      </div>
    </header>
  )
}
