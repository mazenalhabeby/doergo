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
  History,
  CreditCard,
  MapPin,
  Calendar,
  Clock,
  MoreHorizontal,
  Search,
  Sun,
  Moon,
  Menu,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { AnimatedLogo } from "@hbcfield/shared/components"
import { hasAccessModule } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { useCommandPalette } from "@/contexts/command-palette-context"
import { NotificationBell } from "@/components/notification-bell"
import { SupportButton } from "@/components/support/support-widget"
import { ClockWidget } from "@/components/clock-widget"
import { usePresence, PRESENCE_OPTS, presenceRingClass } from "@/components/presence-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
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
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

function isDropdownActive(pathname: string, hrefs: string[]): boolean {
  return hrefs.some((h) => isActive(pathname, h))
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
const navItemBase =
  "relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
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
  const { user, logout, hasPlanFeature } = useAuth()
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const prefetch = usePrefetchRoutes()
  const { t } = useTranslation()

  if (!user) return null

  const initials = `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`
  const fullName = `${user.firstName} ${user.lastName}`

  // Build visible nav items based on permissions
  const showTeam = user.canManageUsers || user.canViewAllTasks // Admin + Dispatcher
  // Employees collaborate INSIDE their space (members appear in the space view),
  // so there is no separate employee "Team" nav item on web.
  const showSpaces = user.canManageUsers || user.canViewAllTasks // Admin + Dispatcher
  const showSchedule = user.canViewAllTasks
  const showAttendance = user.canViewAllTasks
  const showReports = user.canViewAllTasks // report viewers (admins + managers)

  // Personal, module-driven items (Access Profile). These are ADDITIVE — a
  // member who ALSO manages people keeps their own Time Off / clock. Driven by
  // the per-user modules, not suppressed just because management nav is shown.
  // (My Attendance hides only when the management Attendance view is present, to
  // avoid two "Attendance" links.)
  const showMyTimeOff = hasAccessModule(user, "time_off")
  const showMyAttendance = hasAccessModule(user, "clock") && !showAttendance
  // "Manage" is the management hub — redundant with "Team", so only show it when
  // the user doesn't already have Team (i.e. not managers/admins).
  const showManage = hasAccessModule(user, "manage") && !showTeam
  // Overflow items go into "More" menu
  const overflowItems: { label: string; href: string; icon: typeof MapPin }[] = []

  const hasOverflow = overflowItems.length > 0

  return (
    <header className="sticky top-0 z-50 h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1440px] items-center px-6">
      {/* Logo */}
      <Link
        href="/dashboard"
        className="mr-6 flex items-center transition-opacity hover:opacity-80"
      >
        <AnimatedLogo size="small" textColor={resolvedTheme === 'dark' ? '#fafafa' : '#18181b'} />
      </Link>

      {/* Mobile hamburger menu */}
      <MobileMenu
        pathname={pathname}
        showTeam={showTeam}
        showSpaces={showSpaces}
        showSchedule={showSchedule}
        showAttendance={showAttendance}
        showReports={showReports}
        showMyTimeOff={showMyTimeOff}
        showMyAttendance={showMyAttendance}
        showManage={showManage}
      />

      {/* Desktop Navigation */}
      <nav className="hidden lg:flex items-center gap-1">
        {/* Dashboard */}
        <Link
          href="/dashboard"
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

        {/* Team dropdown (admins) */}
        {showTeam && <TeamDropdown pathname={pathname} onOpen={prefetch.prefetchTeam} />}

        {/* Spaces */}
        {showSpaces && (
          <Link
            href="/locations"
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

        {/* Schedule */}
        {showSchedule && (
          <Link
            href="/schedule"
            className={cn(
              navItemBase,
              isActive(pathname, "/schedule") || isActive(pathname, "/employees/availability")
                ? cn(navItemActiveStyle, bottomIndicator)
                : navItemInactive,
            )}
          >
            {t("nav.sidebar.schedule")}
          </Link>
        )}

        {/* Attendance */}
        {showAttendance && (
          <Link
            href="/attendance"
            onMouseEnter={prefetch.prefetchAttendance}
            className={cn(
              navItemBase,
              isActive(pathname, "/attendance")
                ? cn(navItemActiveStyle, bottomIndicator)
                : navItemInactive,
            )}
          >
            {t("nav.sidebar.attendance")}
          </Link>
        )}

        {/* Reports */}
        {showReports && (
          <Link
            href="/reports"
            className={cn(
              navItemBase,
              isActive(pathname, "/reports")
                ? cn(navItemActiveStyle, bottomIndicator)
                : navItemInactive,
            )}
          >
            {t("nav.reports", "Reports")}
          </Link>
        )}

        {/* Employee module-driven items */}
        {showMyTimeOff && (
          <Link href="/my/time-off" className={cn(navItemBase, isActive(pathname, "/my/time-off") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}>
            {t("nav.timeOff")}
          </Link>
        )}
        {showMyAttendance && (
          <Link href="/my/attendance" className={cn(navItemBase, isActive(pathname, "/my/attendance") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}>
            {t("nav.sidebar.attendance")}
          </Link>
        )}
        {showManage && (
          <Link href="/manage" className={cn(navItemBase, isActive(pathname, "/manage") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}>
            {t("nav.manage")}
          </Link>
        )}

        {/* More overflow */}
        {hasOverflow && <MoreDropdown items={overflowItems} pathname={pathname} />}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-1">
        <CommandPaletteButton />
        <ClockWidget />
        <LanguageSwitcher />
        <NotificationBell />
        <SupportButton />
        <UserDropdown
          user={user}
          initials={initials}
          fullName={fullName}
          avatarUrl={user.avatarUrl}
          canManageUsers={user.canManageUsers}
          canInvoice={user.canManageUsers && hasPlanFeature('invoicing')}
          onLogout={logout}
        />
      </div>
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
      className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors text-xs"
    >
      <Search className="size-3.5" />
      <span className="hidden sm:inline text-[11px]">{t("common.search")}</span>
      <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        {isMac ? "\u2318" : "Ctrl+"}K
      </kbd>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Team Dropdown
// ---------------------------------------------------------------------------
function TeamDropdown({ pathname, onOpen }: { pathname: string; onOpen?: () => void }) {
  const { t } = useTranslation()
  const items = ["/members", "/invitations", "/join-requests"]
  const active = isDropdownActive(pathname, items)

  return (
    <DropdownMenu onOpenChange={(open) => { if (open && onOpen) onOpen() }}>
      <DropdownMenuTrigger
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
  showMyTimeOff,
  showMyAttendance,
  showManage,
}: {
  pathname: string
  showTeam: boolean
  showSpaces: boolean
  showSchedule: boolean
  showAttendance: boolean
  showReports: boolean
  showMyTimeOff: boolean
  showMyAttendance: boolean
  showManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  const teamItems = ["/members", "/invitations", "/join-requests"]
  const teamActive = isDropdownActive(pathname, teamItems)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="lg:hidden mr-2 flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors outline-none">
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

        {showSchedule && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link
              href="/schedule"
              onClick={() => setOpen(false)}
              className={cn(
                mobileItemBase,
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

        {showAttendance && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link
              href="/attendance"
              onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/attendance") ? mobileItemActiveStyle : mobileItemInactive)}
            >
              <Clock className="h-4 w-4" />
              {t("nav.sidebar.attendance")}
            </Link>
          </DropdownMenuItem>
        )}

        {/* Employee module-driven items */}
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
        {showReports && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link href="/reports" onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/reports") ? mobileItemActiveStyle : mobileItemInactive)}>
              <BarChart3 className="h-4 w-4" />
              {t("nav.reports", "Reports")}
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
  items: { label: string; href: string; icon: typeof MapPin }[]
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
                <Icon className="h-4 w-4 text-muted-foreground" />
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
  canInvoice,
  onLogout,
}: {
  user: { email: string; role: string; firstName?: string; lastName?: string }
  initials: string
  fullName: string
  avatarUrl?: string | null
  canManageUsers: boolean
  canInvoice: boolean
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

          {/* Subscription & billing (this org's plan/payment) — admins only */}
          {canManageUsers && (
            <DropdownMenuItem asChild className="rounded-md cursor-pointer">
              <Link href="/settings/billing" className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                {t("nav.userMenu.billing")}
              </Link>
            </DropdownMenuItem>
          )}

          {/* Customer invoicing (bill your clients) — admins only, Professional+ */}
          {canInvoice && (
            <>
              <DropdownMenuItem asChild className="rounded-md cursor-pointer">
                <Link href="/invoices" className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {t("nav.sidebar.invoices")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-md cursor-pointer">
                <Link href="/payments" className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <History className="h-4 w-4 text-muted-foreground" />
                  {t("nav.sidebar.paymentHistory")}
                </Link>
              </DropdownMenuItem>
            </>
          )}
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
