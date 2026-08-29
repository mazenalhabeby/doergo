"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useState, useCallback } from "react"
import {
  LayoutDashboard,
  ChevronDown,
  Check,
  LogOut,
  Settings,
  BarChart3,
  Shield,
  FileText,
  ShieldCheck,
  CreditCard,
  MapPin,
  Calendar,
  Clock,
  MoreHorizontal,
  Search,
  Sun,
  Moon,
  Menu,
  AlertTriangle,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useOverflowNav } from "@/hooks/use-overflow-nav"

import { AnimatedLogo } from "@hbcfield/shared/components"
import { hasAccessModule, resolveCrmCaps } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { useCommandPalette } from "@/contexts/command-palette-context"
import { NotificationBell } from "@/components/notification-bell"
import { SupportButton } from "@/components/support/support-widget"
import { ClockWidget } from "@/components/clock-widget"
import { usePresence, PRESENCE_OPTS, presenceRingClass } from "@/components/presence-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { TourLauncherMenuItem, HelpButton } from "@/components/tour"
import { cn } from "@/lib/utils"
import {
  tasksApi,
  locationsApi,
  organizationsApi,
  sprintsApi,
  epicsApi,
  phasesApi,
} from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// ---------------------------------------------------------------------------
// Nav item active-state helper
// ---------------------------------------------------------------------------
/*
  Every href the bar can render. Needed because a prefix match alone lights up
  TWO items at once: on /settings/billing both "/settings" and
  "/settings/billing" matched, so the bar showed two active links and neither
  told you where you were.

  A nav item is active when it matches AND no LONGER href also matches — the
  most specific route wins, which is what a person reads the highlight to mean.
*/
const NAV_HREFS = [
  "/dashboard", "/tasks", "/schedule", "/attendance", "/overtime", "/issues",
  "/locations", "/members", "/clients", "/invoices", "/reports", "/manage",
  "/invitations", "/join-requests", "/settings", "/settings/billing",
  "/my/attendance", "/my/time-off", "/my/documents", "/documents", "/documents/review", "/documents/types", "/documents/templates", "/documents/compliance",
] as const

function matches(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

function isActive(pathname: string, href: string): boolean {
  if (!matches(pathname, href)) return false
  // Beaten by anything more specific that also matches.
  return !NAV_HREFS.some((other) => other.length > href.length && matches(pathname, other))
}

function isDropdownActive(pathname: string, hrefs: string[]): boolean {
  return hrefs.some((h) => isActive(pathname, h))
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
// `whitespace-nowrap` and `shrink-0`: the bar is a fixed h-14 flex row, so a label
// that wraps or is squeezed breaks the header. Labels differ a lot by language —
// "Team Members" is 12 characters in English and 19 in Spanish ("Miembros del
// equipo") — so this cannot be eyeballed in one locale.
const navItemBase =
  "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
const navItemInactive = "text-muted-foreground hover:text-foreground hover:bg-muted/50"
const navItemActiveStyle = "text-foreground font-semibold"
const bottomIndicator =
  "after:absolute after:bottom-[-13px] after:left-1/2 after:-translate-x-1/2 after:h-[2px] after:w-4/5 after:rounded-full after:bg-foreground"

// ---------------------------------------------------------------------------
// Prefetch helpers — warm React Query cache on nav link hover
// ---------------------------------------------------------------------------
const PREFETCH_STALE = 60_000

function usePrefetchRoutes() {
  const qc = useQueryClient()

  const prefetchDashboard = useCallback(() => {
    qc.prefetchQuery({ queryKey: ["tasks"], queryFn: () => tasksApi.list(), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: ["locations"], queryFn: () => locationsApi.list(), staleTime: PREFETCH_STALE })
  }, [qc])

  const prefetchTasks = useCallback(() => {
    qc.prefetchQuery({ queryKey: ["tasks", { status: "all", page: 1, limit: 20 }], queryFn: () => tasksApi.list({ status: "all", page: 1, limit: 20 }), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: ["taskStatusCounts"], queryFn: () => tasksApi.getStatusCounts(), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: ["sprints"], queryFn: () => sprintsApi.list(), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: ["epics"], queryFn: () => epicsApi.list(), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: ["phases"], queryFn: () => phasesApi.list(), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: ["locations"], queryFn: () => locationsApi.list(), staleTime: PREFETCH_STALE })
  }, [qc])

  const prefetchTeam = useCallback(() => {
    qc.prefetchQuery({ queryKey: ["orgMembers", "", "all", 1], queryFn: () => organizationsApi.getMembers({ page: 1, limit: 20 }), staleTime: PREFETCH_STALE })
  }, [qc])

  const prefetchSpaces = useCallback(() => {
    qc.prefetchQuery({ queryKey: ["locations"], queryFn: () => locationsApi.list(), staleTime: PREFETCH_STALE })
  }, [qc])

  const prefetchAttendance = useCallback(() => {
    qc.prefetchQuery({ queryKey: ["locations"], queryFn: () => locationsApi.list(), staleTime: PREFETCH_STALE })
  }, [qc])

  return { prefetchDashboard, prefetchTasks, prefetchTeam, prefetchSpaces, prefetchAttendance }
}

// ---------------------------------------------------------------------------
// TopNavbar
// ---------------------------------------------------------------------------
export function TopNavbar() {
  const { user, logout, hasPlanFeature, hasPermission } = useAuth()
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const prefetch = usePrefetchRoutes()
  const { t, i18n } = useTranslation()

  if (!user) return null

  const initials = `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`
  const fullName = `${user.firstName} ${user.lastName}`

  // Build visible nav items based on permissions
  const showTeam = user.canManageUsers || user.canViewAllTasks // Admin + Dispatcher
  // Employees collaborate INSIDE their space (members appear in the space view),
  // so there is no separate employee "Team" nav item on web.
  const showSpaces = user.canManageWorkspaces || user.canManageUsers || user.canViewAllTasks // Admin + Dispatcher
  const showSchedule = user.canViewAllTasks
  const showAttendance = user.canViewSpaceAttendance || user.canViewAllTasks
  const showReports = user.canViewAllTasks || !!user.canViewReports // admins + managers + Show-in-Management members granted report access
  // CRM navbar tab: for members with CRM access who are NOT org-level managers.
  // Org admins/managers reach the CRM via the Spaces nav → a space's Customers tab,
  // so they don't need this top-level entry. Per-space-only managers (who have no
  // Spaces nav) DO get it, otherwise they'd have no way to reach the CRM at all.
  const uAccess = (user as { role?: string; access?: { org?: Record<string, boolean> } })
  const isOrgManager = user.role === "ADMIN" || user.canManageUsers || uAccess.access?.org?.canManageUsers === true
  const showCrm = !isOrgManager && resolveCrmCaps(uAccess.role, uAccess.access?.org).canAccess
  // Invoices: admins bill their customers. Shown for admins regardless of tier —
  // the /invoices page enforces the Professional+ 'invoicing' capability (and
  // shows an upgrade panel under-tier), so this stays discoverable.
  // Matches what the API actually enforces: every read on /invoices is
  // @RequirePermission('canViewAllTasks'); writes are ADMIN-only (audit).
  //
  // It was canManageUsers, and the four permission flags are independent — so a
  // member with canManageUsers but not canViewAllTasks (an office administrator,
  // the obvious case) SAW the nav item and then hit a page whose every request
  // 403s. The reverse also held: a manager with canViewAllTasks had no nav item
  // for something they could already open by URL, so hiding it protected nothing.
  const showInvoices = user.canViewAllTasks

  // Personal, module-driven items (Access Profile). These are ADDITIVE — a
  // member who ALSO manages people keeps their own Time Off / clock. Driven by
  // the per-user modules, not suppressed just because management nav is shown.
  // (My Attendance hides only when the management Attendance view is present, to
  // avoid two "Attendance" links.)
  const showMyTimeOff = hasAccessModule(user, "time_off")
  /*
    Personal documents.

    Gated on the ADD-ON alone, not on a permission: reading your own file is
    never a permission. An organization that has not bought Member Documents
    sees no link at all, which is why nothing about this feature is visible to
    an existing customer until they choose it.
  */
  const showMyDocuments = hasPlanFeature("documents")
  /*
    The admin surface. Needs the add-on AND the permission to issue — unlike
    /my/documents, which is nobody's permission because it is their own file.
  */
  const showIssueDocuments = hasPlanFeature("documents") && hasPermission("canIssueDocuments")
  const showDocumentTemplates = hasPlanFeature("documents") && hasPermission("canManageDocumentTemplates")
  /*
    Credential validity rides on canAssignTasks, not on a document permission:
    a dispatcher needs to know WHY somebody dropped out of the schedule without
    being able to open their file.
  */
  const showDocumentCompliance = hasPlanFeature("documents") && hasPermission("canAssignTasks")

  // Measured overflow for the navigation row (see hooks/use-overflow-nav).
  // Re-measures whenever the language changes, because that changes every width.
  const { containerRef: navRef, overflow: navOverflow } = useOverflowNav(i18n.language)
  const showMyAttendance = hasAccessModule(user, "clock") && !showAttendance
  // "Manage" is the management hub — redundant with "Team", so only show it when
  // the user doesn't already have Team (i.e. not managers/admins).
  const showManage = hasAccessModule(user, "manage") && !showTeam
  // Overflow items go into "More" menu
  return (
    /*
      Two rows, because one was a fight the navigation kept losing.
      Row 1 — who you are, what you're looking for, what needs you now.
      Row 2 — where you can go, with the WHOLE width to itself.

      The single row carried eleven links and seven controls in 56px. Labels are
      written by translators ("Customer Invoices" is 17 characters; "Facturas de
      clientes" is 20), so it overflowed in some language at any width, and the
      previous fixes each failed visibly: a breakpoint was wrong in Spanish, and
      scrolling clipped a label mid-word with nothing to say more existed.
      Giving navigation its own row removes the competition instead of rationing it.
    */
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
      {/* ── Row 1 ─────────────────────────────────────────────────────────── */}
      <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-4 px-6">
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
      <div className="mx-auto flex h-11 max-w-[1440px] items-center border-t border-border/50 px-6">
      {/* Mobile hamburger menu */}
      <MobileMenu
        pathname={pathname}
        showTeam={showTeam}
        showSpaces={showSpaces}
        showSchedule={showSchedule}
        showAttendance={showAttendance}
        showReports={showReports}
        showInvoices={showInvoices}
        showMyTimeOff={showMyTimeOff}
        showMyAttendance={showMyAttendance}
        showManage={showManage}
        showCrm={showCrm}
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

        {/* Team dropdown (admins) */}
        {showTeam && <TeamDropdown pathname={pathname} onOpen={prefetch.prefetchTeam} />}

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
        {(showSchedule || showAttendance) && (
          <TimeAttendanceDropdown
            pathname={pathname}
            showSchedule={showSchedule}
            showAttendance={showAttendance}
            showMyTimeOff={showMyTimeOff}
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
        {showMyTimeOff && (
          <Link href="/my/time-off"
          data-nav-item
          data-nav-href="/my/time-off"
          data-nav-label={t("nav.timeOff")}
          data-nav-active={isActive(pathname, "/my/time-off")} data-tour="nav-my-timeoff" className={cn(navItemBase, isActive(pathname, "/my/time-off") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}>
            {t("nav.timeOff")}
          </Link>
        )}
        {showMyDocuments && (
          <DocumentsDropdown
            pathname={pathname}
            showIssue={showIssueDocuments}
            showTemplates={showDocumentTemplates}
            showCompliance={showDocumentCompliance}
          />
        )}
        {showMyAttendance && (
          <Link href="/my/attendance"
          data-nav-item
          data-nav-href="/my/attendance"
          data-nav-label={t("nav.sidebar.attendance")}
          data-nav-active={isActive(pathname, "/my/attendance")} data-tour="nav-my-attendance" className={cn(navItemBase, isActive(pathname, "/my/attendance") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}>
            {t("nav.sidebar.attendance")}
          </Link>
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

// ---------------------------------------------------------------------------
// Command Palette Button
// ---------------------------------------------------------------------------
function CommandPaletteButton() {
  const { setOpen } = useCommandPalette()
  const { t } = useTranslation()
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

  return (
    <button
      onClick={() => setOpen(true)}
      data-tour="nav-command"
      className="flex w-[190px] lg:w-[240px] items-center gap-2 h-9 px-3 rounded-lg border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
    >
      <Search className="size-4 shrink-0" />
      <span className="hidden sm:inline text-[13px]">{t("common.search")}</span>
      <kbd className="pointer-events-none ml-auto hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        {isMac ? "\u2318" : "Ctrl+"}K
      </kbd>
    </button>
  )
}

function TeamDropdown({ pathname, onOpen }: { pathname: string; onOpen?: () => void }) {
  const { t } = useTranslation()
  const items = ["/members", "/invitations", "/join-requests"]
  const active = isDropdownActive(pathname, items)

  return (
    <DropdownMenu onOpenChange={(open) => { if (open && onOpen) onOpen() }}>
      <DropdownMenuTrigger
        data-tour="nav-team"
        className={cn(
          navItemBase,
          "cursor-pointer select-none outline-none",
          active ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
        )}
      >
        {t("nav.team")}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-[180px] rounded-lg p-1">
        <DropdownMenuItem asChild className="rounded-md cursor-pointer">
          <Link href="/members" className="flex items-center gap-2 px-2 py-1.5 text-sm">
            {t("nav.sidebar.members")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-md cursor-pointer">
          <Link href="/invitations" className="flex items-center gap-2 px-2 py-1.5 text-sm">
            {t("nav.sidebar.invitations")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-md cursor-pointer">
          <Link href="/join-requests" className="flex items-center gap-2 px-2 py-1.5 text-sm">
            {t("nav.sidebar.joinRequests")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Documents Dropdown (personal file + the admin surfaces)
// ---------------------------------------------------------------------------
/**
 * Everything document-shaped, in one place.
 *
 * Templates and Credentials had no navigation at all — reachable only from a
 * link inside the Issue page, which meant finding them required knowing they
 * existed. Four related routes across two audiences is exactly what a dropdown
 * is for.
 *
 * With only one item visible — an ordinary member, who sees just their own file
 * — it renders as a plain link instead. A menu that opens to reveal a single
 * entry is one more click for nothing.
 */
function DocumentsDropdown({
  pathname,
  showIssue,
  showTemplates,
  showCompliance,
}: {
  pathname: string
  showIssue: boolean
  showTemplates: boolean
  showCompliance: boolean
}) {
  const { t } = useTranslation()

  /*
    EXACTLY the routes this menu contains. The attendance menu listed a route it
    did not contain and omitted two it did, so the bar lit up twice on one page
    and nowhere on two others — the same mistake is easy to make here, where
    three of the four share a prefix.
  */
  const items = [
    { href: "/my/documents", label: t("nav.myDocuments"), show: true },
    { href: "/documents", label: t("nav.issueDocuments"), show: showIssue },
    { href: "/documents/review", label: t("documents.review.title"), show: showIssue },
    { href: "/documents/types", label: t("documents.types.title"), show: showTemplates },
    { href: "/documents/templates", label: t("documents.templates.title"), show: showTemplates },
    { href: "/documents/compliance", label: t("documents.compliance.title"), show: showCompliance },
  ].filter((i) => i.show)

  const active = isDropdownActive(pathname, items.map((i) => i.href))

  // One entry is a link, not a menu.
  if (items.length === 1) {
    const only = items[0]!
    return (
      <Link
        href={only.href}
        data-nav-item
        data-nav-href={only.href}
        data-nav-label={only.label}
        data-nav-active={isActive(pathname, only.href)}
        data-tour="nav-my-documents"
        className={cn(navItemBase, active ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}
      >
        {only.label}
      </Link>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-nav-item
        data-nav-href="/my/documents"
        data-nav-label={t("nav.documents")}
        data-nav-active={active}
        data-tour="nav-documents"
        className={cn(
          navItemBase,
          "cursor-pointer select-none outline-none",
          active ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
        )}
      >
        {t("nav.documents")}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-[200px] rounded-lg p-1">
        {items.map((item, i) => (
          <div key={item.href}>
            {/* The member's own file first, then a rule: below it is everything
                about OTHER people, which is a different kind of screen. */}
            {i === 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem asChild className="rounded-md cursor-pointer">
              <Link href={item.href} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                {item.label}
              </Link>
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Time & Attendance Dropdown (management: attendance + schedule + time-off)
// ---------------------------------------------------------------------------
function TimeAttendanceDropdown({
  pathname,
  showSchedule,
  showAttendance,
  showMyTimeOff,
  onOpen,
}: {
  pathname: string
  showSchedule: boolean
  showAttendance: boolean
  showMyTimeOff: boolean
  onOpen?: () => void
}) {
  const { t } = useTranslation()
  // Trigger is active on any of the grouped routes (schedule also covers its
  // legacy /employees/availability target; my/time-off is the personal time-off page).
  /*
    Exactly the routes this menu contains, plus the legacy alias that redirects
    into it. It listed "/my/time-off" — which moved out to its own top-level
    link — so on that page the standalone link AND this trigger both lit up,
    and the bar pointed at two places. It also omitted /issues and /overtime,
    which ARE in the menu, so on those pages it highlighted nothing.
  */
  const active = isDropdownActive(pathname, ["/attendance", "/schedule", "/overtime", "/issues", "/employees/availability"])

  return (
    <DropdownMenu onOpenChange={(open) => { if (open && onOpen) onOpen() }}>
      <DropdownMenuTrigger
        data-tour="nav-time-attendance"
        className={cn(
          navItemBase,
          "cursor-pointer select-none outline-none",
          active ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
        )}
      >
        {t("nav.timeAttendance")}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-[200px] rounded-lg p-1">
        {showAttendance && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer">
            <Link href="/attendance" className="flex items-center gap-2 px-2 py-1.5 text-sm">
              {t("nav.sidebar.attendance")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className="rounded-md cursor-pointer">
          <Link href="/issues" className="flex items-center gap-2 px-2 py-1.5 text-sm">
            {t("nav.sidebar.issues", "Shift Issues")}
          </Link>
        </DropdownMenuItem>
        {showSchedule && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer">
            <Link href="/schedule" className="flex items-center gap-2 px-2 py-1.5 text-sm">
              {t("nav.sidebar.schedule")}
            </Link>
          </DropdownMenuItem>
        )}
        {/* Overtime requests and approvals. This page had 478 lines of UI and NO
            link anywhere in the web app — reachable only by typing the URL. It
            belongs here: the fourth manager-facing working-time tool. */}
        {showAttendance && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer">
            <Link href="/overtime" className="flex items-center gap-2 px-2 py-1.5 text-sm">
              {t("nav.sidebar.overtime", "Overtime")}
            </Link>
          </DropdownMenuItem>
        )}
        {/* Personal time-off is deliberately NOT here. This menu is management
            tools — everyone else's attendance, rota, shift issues and overtime.
            "My Time Off" is a personal page and is now a top-level item for
            managers too, not buried inside a management menu. */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Mobile Menu
// ---------------------------------------------------------------------------
const mobileItemBase =
  "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors w-full"
const mobileItemInactive = "text-muted-foreground hover:text-foreground hover:bg-muted/50"
const mobileItemActiveStyle = "text-foreground font-semibold bg-muted/60"

function MobileMenu({
  pathname,
  showTeam,
  showSpaces,
  showSchedule,
  showAttendance,
  showReports,
  showInvoices,
  showMyTimeOff,
  showMyAttendance,
  showMyDocuments,
  showIssueDocuments,
  showDocumentTemplates,
  showDocumentCompliance,
  showManage,
  showCrm,
}: {
  pathname: string
  showTeam: boolean
  showSpaces: boolean
  showSchedule: boolean
  showAttendance: boolean
  showReports: boolean
  showInvoices: boolean
  showMyTimeOff: boolean
  showMyAttendance: boolean
  showManage: boolean
  showCrm?: boolean
  showMyDocuments: boolean
  showIssueDocuments: boolean
  showDocumentTemplates: boolean
  showDocumentCompliance: boolean
}) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  const teamItems = ["/members", "/invitations", "/join-requests"]
  const teamActive = isDropdownActive(pathname, teamItems)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="md:hidden mr-2 flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors outline-none">
        <Menu className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-[200px] rounded-lg p-1">
        <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className={cn(mobileItemBase, isActive(pathname, "/dashboard") ? mobileItemActiveStyle : mobileItemInactive)}
          >
            <LayoutDashboard className="h-4 w-4" />
            {t("nav.sidebar.dashboard")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
          <Link
            href="/tasks"
            onClick={() => setOpen(false)}
            className={cn(mobileItemBase, isActive(pathname, "/tasks") ? mobileItemActiveStyle : mobileItemInactive)}
          >
            {t("nav.sidebar.tasks")}
          </Link>
        </DropdownMenuItem>

        {/* CRM — present on the desktop bar but previously missing here, so it was
            unreachable from the nav below the breakpoint. */}
        {showCrm && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link
              href="/clients"
              onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/clients") ? mobileItemActiveStyle : mobileItemInactive)}
            >
              {t("nav.crm", "CRM")}
            </Link>
          </DropdownMenuItem>
        )}

        {showTeam && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("nav.team")}
            </DropdownMenuLabel>
            <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
              <Link
                href="/members"
                onClick={() => setOpen(false)}
                className={cn(mobileItemBase, "pl-5", isActive(pathname, "/members") ? mobileItemActiveStyle : mobileItemInactive)}
              >
                {t("nav.sidebar.members")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
              <Link
                href="/invitations"
                onClick={() => setOpen(false)}
                className={cn(mobileItemBase, "pl-5", isActive(pathname, "/invitations") ? mobileItemActiveStyle : mobileItemInactive)}
              >
                {t("nav.sidebar.invitations")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
              <Link
                href="/join-requests"
                onClick={() => setOpen(false)}
                className={cn(mobileItemBase, "pl-5", isActive(pathname, "/join-requests") ? mobileItemActiveStyle : mobileItemInactive)}
              >
                {t("nav.sidebar.joinRequests")}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {showSpaces && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link
              href="/locations"
              onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/locations") ? mobileItemActiveStyle : mobileItemInactive)}
            >
              <MapPin className="h-4 w-4" />
              {t("nav.spaces")}
            </Link>
          </DropdownMenuItem>
        )}

        {(showSchedule || showAttendance) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("nav.timeAttendance")}
            </DropdownMenuLabel>
            {showAttendance && (
              <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
                <Link
                  href="/attendance"
                  onClick={() => setOpen(false)}
                  className={cn(mobileItemBase, "pl-5", isActive(pathname, "/attendance") ? mobileItemActiveStyle : mobileItemInactive)}
                >
                  <Clock className="h-4 w-4" />
                  {t("nav.sidebar.attendance")}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
              <Link
                href="/issues"
                onClick={() => setOpen(false)}
                className={cn(mobileItemBase, "pl-5", isActive(pathname, "/issues") ? mobileItemActiveStyle : mobileItemInactive)}
              >
                <AlertTriangle className="h-4 w-4" />
                {t("nav.sidebar.issues", "Shift Issues")}
              </Link>
            </DropdownMenuItem>
            {showSchedule && (
              <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
                <Link
                  href="/schedule"
                  onClick={() => setOpen(false)}
                  className={cn(
                    mobileItemBase,
                    "pl-5",
                    isActive(pathname, "/schedule") || isActive(pathname, "/employees/availability")
                      ? mobileItemActiveStyle
                      : mobileItemInactive,
                  )}
                >
                  <Calendar className="h-4 w-4" />
                  {t("nav.sidebar.schedule")}
                </Link>
              </DropdownMenuItem>
            )}
            {/* Personal time-off (distinct page); management time-off is a tab on Schedule. */}
            {showAttendance && (
              <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
                <Link
                  href="/overtime"
                  onClick={() => setOpen(false)}
                  className={cn(mobileItemBase, "pl-5", isActive(pathname, "/overtime") ? mobileItemActiveStyle : mobileItemInactive)}
                >
                  {t("nav.sidebar.overtime", "Overtime")}
                </Link>
              </DropdownMenuItem>
            )}
          </>
        )}

        {/* Employee module-driven items. Personal Time Off shows standalone only
            when there's no Time & Attendance group above to host it. */}
        {showMyTimeOff && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/my/time-off" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/my/time-off") ? mobileItemActiveStyle : mobileItemInactive)}>
              <Calendar className="h-4 w-4" />
              {t("nav.timeOff")}
            </Link>
          </DropdownMenuItem>
        )}
        {showMyAttendance && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/my/attendance" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/my/attendance") ? mobileItemActiveStyle : mobileItemInactive)}>
              <Clock className="h-4 w-4" />
              {t("nav.sidebar.attendance")}
            </Link>
          </DropdownMenuItem>
        )}
        {/*
          Documents. Flat here rather than a nested menu: this sheet is already a
          vertical list, and a submenu inside it is one more tap for the same
          four links.
        */}
        {showMyDocuments && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/my/documents" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/my/documents") ? mobileItemActiveStyle : mobileItemInactive)}>
              <FileText className="h-4 w-4" />
              {t("nav.myDocuments")}
            </Link>
          </DropdownMenuItem>
        )}
        {showIssueDocuments && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/documents" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/documents") ? mobileItemActiveStyle : mobileItemInactive)}>
              <FileText className="h-4 w-4" />
              {t("nav.issueDocuments")}
            </Link>
          </DropdownMenuItem>
        )}
        {showDocumentTemplates && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/documents/templates" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/documents/templates") ? mobileItemActiveStyle : mobileItemInactive)}>
              <FileText className="h-4 w-4" />
              {t("documents.templates.title")}
            </Link>
          </DropdownMenuItem>
        )}
        {showDocumentCompliance && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/documents/compliance" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/documents/compliance") ? mobileItemActiveStyle : mobileItemInactive)}>
              <ShieldCheck className="h-4 w-4" />
              {t("documents.compliance.title")}
            </Link>
          </DropdownMenuItem>
        )}

        {/* B2B "Customers" directory retired → a customer is now a Space (kind
            CUSTOMER); client portals are managed per-space (no top-level item). */}
        {showReports && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/reports" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/reports") ? mobileItemActiveStyle : mobileItemInactive)}>
              <BarChart3 className="h-4 w-4" />
              {t("nav.reports", "Reports")}
            </Link>
          </DropdownMenuItem>
        )}
        {showInvoices && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/invoices" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/invoices") ? mobileItemActiveStyle : mobileItemInactive)}>
              <FileText className="h-4 w-4" />
              {t("nav.sidebar.invoices")}
            </Link>
          </DropdownMenuItem>
        )}
        {showManage && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/manage" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/manage") ? mobileItemActiveStyle : mobileItemInactive)}>
              <Settings className="h-4 w-4" />
              {t("nav.manage")}
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// More Dropdown (overflow items)
// ---------------------------------------------------------------------------
function MoreDropdown({
  items,
  pathname,
}: {
  // `icon` optional: these come from the measured nav row, which is text-only.
  items: { label: string; href: string; icon?: typeof MapPin }[]
  pathname: string
}) {
  const active = isDropdownActive(
    pathname,
    items.map((i) => i.href),
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          navItemBase,
          "cursor-pointer select-none outline-none",
          active ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-[180px] rounded-lg p-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <DropdownMenuItem key={item.href} asChild className="rounded-md cursor-pointer">
              <Link href={item.href} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                {item.label}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Theme Toggle (inside dropdown)
// ---------------------------------------------------------------------------
function ThemeToggleItem() {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()
  const isDark = theme === "dark"
  return (
    <DropdownMenuItem
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-md cursor-pointer"
    >
      {isDark ? <Sun className="h-4 w-4 mr-2 text-muted-foreground" /> : <Moon className="h-4 w-4 mr-2 text-muted-foreground" />}
      {isDark ? t("nav.lightMode") : t("nav.darkMode")}
    </DropdownMenuItem>
  )
}

// ---------------------------------------------------------------------------
// User Dropdown
// ---------------------------------------------------------------------------
function UserDropdown({
  user,
  initials,
  fullName,
  avatarUrl,
  canManageUsers,
  onLogout,
}: {
  user: { email: string; role: string; firstName?: string; lastName?: string }
  initials: string
  fullName: string
  avatarUrl?: string | null
  canManageUsers: boolean
  onLogout: () => void
}) {
  const { t } = useTranslation()
  const { current: presence, set: setPresence, saving: savingPresence } = usePresence()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="ml-2 flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-80"
        title={t("presence.title", "Availability")}
      >
        {/* Ring color = availability (Slack/Teams-style status on the avatar). */}
        <UserAvatar
          firstName={user.firstName}
          lastName={user.lastName}
          avatarUrl={avatarUrl}
          size="md"
          className={cn("ring-2 ring-offset-1 ring-offset-background", presenceRingClass(presence))}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-64 rounded-xl p-1.5">
        {/* User info */}
        <DropdownMenuLabel className="px-2 py-2 font-normal">
          <div className="flex items-center gap-3">
            <UserAvatar
              firstName={user.firstName}
              lastName={user.lastName}
              avatarUrl={avatarUrl}
              size="lg"
              className={cn("ring-2 ring-offset-1 ring-offset-background", presenceRingClass(presence))}
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{fullName}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Availability (Available / Busy / Away) — sets the ring on the avatar
            and what teammates see. No separate top-bar pill. */}
        <DropdownMenuLabel className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("presence.title", "Availability")}
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {PRESENCE_OPTS.map((o) => (
            <DropdownMenuItem
              key={o.value}
              onClick={() => setPresence(o.value)}
              disabled={savingPresence}
              className="rounded-md cursor-pointer gap-2 px-2 py-1.5 text-sm"
            >
              <span className={cn("h-2 w-2 rounded-full", o.dot)} />
              {t(o.key, o.def)}
              {presence === o.value && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {/* Settings — everyone. No ?section so the page picks the role-appropriate
            landing (admins → General, others → their Profile). Replaces the old
            "My Profile" item, which redirected into this same settings page. */}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="rounded-md cursor-pointer">
            <Link href="/settings" className="flex items-center gap-2 px-2 py-1.5 text-sm">
              <Settings className="h-4 w-4 text-muted-foreground" />
              {t("nav.userMenu.settings")}
            </Link>
          </DropdownMenuItem>

          {/* Replay the role-appropriate guided tour */}
          <TourLauncherMenuItem />


          {/* Subscription & billing (this org's plan/payment) — admins only */}
          {canManageUsers && (
            <DropdownMenuItem asChild className="rounded-md cursor-pointer">
              <Link href="/settings/billing" className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                {t("nav.userMenu.billing")}
              </Link>
            </DropdownMenuItem>
          )}

          {/* Customer invoicing (Invoices + received payments) moved to the main
              navbar Invoices dropdown; the avatar menu keeps subscription/system
              billing above. */}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <ThemeToggleItem />

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onLogout}
          className="rounded-md cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {t("nav.userMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
