"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useState, useCallback } from "react"
import {
  LayoutDashboard,
  ChevronDown,
  LogOut,
  Settings,
  Shield,
  User,
  FileText,
  History,
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

import { AnimatedLogo } from "@hbcfield/shared/components"
import { canContactColleagues } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { useCommandPalette } from "@/contexts/command-palette-context"
import { NotificationBell } from "@/components/notification-bell"
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
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const prefetch = usePrefetchRoutes()

  if (!user) return null

  const initials = `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`
  const fullName = `${user.firstName} ${user.lastName}`

  // Build visible nav items based on permissions
  const showTeam = user.canManageUsers || user.canViewAllTasks // Admin + Dispatcher
  // Employees who can contact colleagues get a simple Team page (not the admin
  // members dropdown).
  const showContactTeam = !showTeam && canContactColleagues(user)
  const showSpaces = user.canManageUsers || user.canViewAllTasks // Admin + Dispatcher
  const showSchedule = user.canViewAllTasks
  const showAttendance = user.canViewAllTasks
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
          Dashboard
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
          Tasks
        </Link>

        {/* Team dropdown (admins) */}
        {showTeam && <TeamDropdown pathname={pathname} onOpen={prefetch.prefetchTeam} />}

        {/* Team page (employees who can contact colleagues) */}
        {showContactTeam && (
          <Link
            href="/team"
            className={cn(
              navItemBase,
              isActive(pathname, "/team") ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
            )}
          >
            Team
          </Link>
        )}

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
            Spaces
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
            Schedule
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
            Attendance
          </Link>
        )}

        {/* More overflow */}
        {hasOverflow && <MoreDropdown items={overflowItems} pathname={pathname} />}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-1">
        <CommandPaletteButton />
        <NotificationBell />
        <UserDropdown
          user={user}
          initials={initials}
          fullName={fullName}
          avatarUrl={user.avatarUrl}
          canManageUsers={user.canManageUsers}
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
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

  return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors text-xs"
    >
      <Search className="size-3.5" />
      <span className="hidden sm:inline text-[11px]">Search</span>
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
        Team
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-[180px] rounded-lg p-1">
        <DropdownMenuItem asChild className="rounded-md cursor-pointer">
          <Link href="/members" className="flex items-center gap-2 px-2 py-1.5 text-sm">
            Members
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-md cursor-pointer">
          <Link href="/invitations" className="flex items-center gap-2 px-2 py-1.5 text-sm">
            Invitations
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-md cursor-pointer">
          <Link href="/join-requests" className="flex items-center gap-2 px-2 py-1.5 text-sm">
            Join Requests
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
}: {
  pathname: string
  showTeam: boolean
  showSpaces: boolean
  showSchedule: boolean
  showAttendance: boolean
}) {
  const [open, setOpen] = useState(false)

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
            Dashboard
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
          <Link
            href="/tasks"
            onClick={() => setOpen(false)}
            className={cn(mobileItemBase, isActive(pathname, "/tasks") ? mobileItemActiveStyle : mobileItemInactive)}
          >
            Tasks
          </Link>
        </DropdownMenuItem>

        {showTeam && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-3 py-1 text-xs font-medium text-muted-foreground">
              Team
            </DropdownMenuLabel>
            <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
              <Link
                href="/members"
                onClick={() => setOpen(false)}
                className={cn(mobileItemBase, "pl-5", isActive(pathname, "/members") ? mobileItemActiveStyle : mobileItemInactive)}
              >
                Members
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
              <Link
                href="/invitations"
                onClick={() => setOpen(false)}
                className={cn(mobileItemBase, "pl-5", isActive(pathname, "/invitations") ? mobileItemActiveStyle : mobileItemInactive)}
              >
                Invitations
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
              <Link
                href="/join-requests"
                onClick={() => setOpen(false)}
                className={cn(mobileItemBase, "pl-5", isActive(pathname, "/join-requests") ? mobileItemActiveStyle : mobileItemInactive)}
              >
                Join Requests
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
              Spaces
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
              Schedule
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
              Attendance
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
  const isDark = theme === "dark"
  return (
    <DropdownMenuItem
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-md cursor-pointer"
    >
      {isDark ? <Sun className="h-4 w-4 mr-2 text-muted-foreground" /> : <Moon className="h-4 w-4 mr-2 text-muted-foreground" />}
      {isDark ? "Light Mode" : "Dark Mode"}
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-2 flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <UserAvatar
          firstName={user.firstName}
          lastName={user.lastName}
          avatarUrl={avatarUrl}
          size="md"
          className="ring-1 ring-border"
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
              className="ring-1 ring-border"
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{fullName}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Org settings & billing — admins only */}
        {canManageUsers && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="rounded-md cursor-pointer">
                <Link href="/settings" className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-md cursor-pointer">
                <Link href="/invoices" className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Invoices
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-md cursor-pointer">
                <Link href="/payments" className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Payment History
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
          </>
        )}

        <ThemeToggleItem />

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onLogout}
          className="rounded-md cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
