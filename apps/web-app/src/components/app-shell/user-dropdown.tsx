"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import {
  Check,
  LogOut,
  Settings,
  CreditCard,
  Sun,
  Moon,
  Languages,
  ChevronsUpDown,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { usePresence, PRESENCE_OPTS, presenceRingClass } from "@/components/attendance/presence-toggle"
import { TourLauncherMenuItem } from "@/components/tour"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/common/user-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LanguageItems } from "./language-switcher"

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
export function UserDropdown({
  user,
  fullName,
  avatarUrl,
  canManageUsers,
  onLogout,
  compact = false,
}: {
  user: { email: string; role: string; firstName?: string; lastName?: string }
  fullName: string
  avatarUrl?: string | null
  canManageUsers: boolean
  onLogout: () => void
  /** The sidebar's collapsed rail: the avatar alone. */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const { current: presence, set: setPresence, saving: savingPresence } = usePresence()
  const presenceOpt = PRESENCE_OPTS.find((o) => o.value === presence)
  const presenceLabel = presenceOpt ? t(presenceOpt.key, presenceOpt.def) : user.email
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-tour="nav-profile"
        aria-label={`${fullName} — ${t("presence.title", "Availability")}`}
        className={cn(
          "flex h-14 w-full min-w-0 items-center gap-3 rounded-2xl px-2 text-left text-shell-ink outline-none",
          "transition-colors hover:bg-shell-hover focus-visible:ring-2 focus-visible:ring-shell-accent",
          compact && "justify-center px-0",
        )}
      >
        {/* Ring color = availability (Slack/Teams-style status on the avatar). */}
        <UserAvatar
          firstName={user.firstName}
          lastName={user.lastName}
          avatarUrl={avatarUrl}
          size="md"
          className={cn("shrink-0 ring-2 ring-offset-1 ring-offset-transparent", presenceRingClass(presence))}
        />
        {!compact && (
          <>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{fullName}</span>
              <span className="truncate text-xs text-shell-soft">{presenceLabel}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-shell-soft" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={compact ? "right" : "top"} align="start" sideOffset={10} className="w-64 rounded-xl p-1.5">
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="rounded-md cursor-pointer gap-2 px-2 py-1.5 text-sm">
            <Languages className="h-4 w-4 text-muted-foreground" />
            {t("common.language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[180px] rounded-lg p-1">
            <LanguageItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

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
