"use client"

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { ClockWidget } from "@/components/attendance/clock-widget"
import { AccountMenu } from "../account-menu"
import { useShellNav } from "../nav/use-shell-nav"
import { SidebarHeader } from "./sidebar-header"
import { SidebarNav } from "./sidebar-nav"
import { useSidebarState } from "./use-sidebar-state"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Icon } from "@/components/ui/icon"

/**
 * Everything the sidebar holds — the organization, the menu, the shift card and the account — rendered by the
 * desktop sidebar AND the phone drawer, so the two can never offer different things.
 */
export function SidebarBody({
  rail = false,
  drawer = false,
  onNavigate,
  toggle,
}: {
  rail?: boolean
  /** In the phone drawer: the sheet's own close button sits top-right. */
  drawer?: boolean
  onNavigate?: () => void
  /** The collapse button (desktop only). */
  toggle?: React.ReactNode
}) {
  const { user } = useAuth()
  const sections = useShellNav()
  if (!user) return null
  return (
    <>
      <div className={cn("flex items-center gap-1.5 pb-2.5", rail && "flex-col", drawer && "pr-9")}>
        <SidebarHeader rail={rail} />
        {toggle}
      </div>
      <div className="shell-scroll -mr-1.5 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1.5">
        <SidebarNav sections={sections} rail={rail} onNavigate={onNavigate} />
      </div>
      <div className="flex flex-col gap-1.5 pt-2">
        <ClockWidget compact={rail} />
        <AccountMenu compact={rail} />
      </div>
    </>
  )
}

/**
 * The desktop sidebar (≥ lg): 268px, or the 76px rail — changed only by the toggle or "[" (no hover-open; see
 * use-sidebar-state).
 *
 * ⚠️ MOUNTED only at desktop width, not merely hidden: a CSS-hidden copy still ran the clock, presence,
 * approvals and documents queries and the "[" key on every phone — and beside the open drawer there were two
 * clock widgets, two pickers and two early-clock-out dialogs.
 */
export function Sidebar() {
  const desktop = useMediaQuery("(min-width: 1024px)")
  return desktop ? <DesktopSidebar /> : null
}

function DesktopSidebar() {
  const { t } = useTranslation()
  const { collapsed, toggle } = useSidebarState()
  const rail = collapsed
  const label = collapsed ? t("nav.expandMenu", "Open the menu") : t("nav.collapseMenu", "Collapse the menu")

  return (
    <aside
      aria-label={t("nav.navigation", "Navigation")}
      className={cn("shell-motion relative z-40 shrink-0 font-shell", "transition-[width] duration-300 ease-apple")}
      style={{ width: collapsed ? "var(--shell-rail)" : "var(--shell-open)" }}
    >
      <div
        className={cn(
          "absolute bottom-2.5 left-0 top-2.5 flex flex-col overflow-hidden rounded-r-3xl py-3 pl-3 pr-2.5",
          "transition-[width] duration-300 ease-apple",
        )}
        style={{ width: rail ? "var(--shell-rail)" : "var(--shell-open)" }}
      >
        <SidebarBody
          rail={rail}
          toggle={
            <button
              type="button"
              onClick={toggle}
              aria-label={label}
              title={`${label} ( [ )`}
              aria-keyshortcuts="["
              className={cn(
                "grid size-[34px] shrink-0 place-items-center rounded-[10px] text-shell-soft outline-none",
                "transition-colors hover:bg-shell-hover hover:text-shell-ink focus-visible:ring-2 focus-visible:ring-shell-accent",
              )}
            >
              <Icon name="sidebarLine" size={18} />
            </button>
          }
        />
      </div>
    </aside>
  )
}
