"use client"

import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { ClockWidget } from "@/components/attendance/clock-widget"
import { AccountMenu } from "../account-menu"
import { useShellNav } from "../nav/use-shell-nav"
import { SidebarHeader } from "./sidebar-header"
import { SidebarNav } from "./sidebar-nav"
import { useSidebarState } from "./use-sidebar-state"

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
 * The desktop sidebar (≥ lg): 268px, or the 76px rail. The column keeps its width while a collapsed rail PEEKS,
 * so the page never moves; the panel floats over it with a shadow instead.
 */
export function Sidebar() {
  const { t } = useTranslation()
  const { collapsed, peeking, toggle, peekIn, peekOut } = useSidebarState()
  const panel = useRef<HTMLDivElement>(null)
  const rail = collapsed && !peeking
  const label = collapsed ? t("nav.expandMenu", "Open the menu") : t("nav.collapseMenu", "Collapse the menu")

  return (
    <aside
      aria-label={t("nav.navigation", "Navigation")}
      className="shell-motion relative z-40 hidden shrink-0 transition-[width] duration-300 ease-[cubic-bezier(.32,.72,0,1)] lg:block"
      style={{ width: collapsed ? "var(--shell-rail)" : "var(--shell-open)" }}
    >
      <div
        ref={panel}
        onMouseEnter={collapsed ? peekIn : undefined}
        onMouseLeave={collapsed ? peekOut : undefined}
        onFocusCapture={collapsed ? peekIn : undefined}
        onBlurCapture={(e) => {
          if (collapsed && !panel.current?.contains(e.relatedTarget as Node | null)) peekOut()
        }}
        className={cn(
          "absolute bottom-2.5 left-0 top-2.5 flex flex-col overflow-hidden rounded-r-3xl py-3 pl-3 pr-2.5",
          "transition-[width,background-color,box-shadow] duration-300 ease-[cubic-bezier(.32,.72,0,1)]",
          peeking && "bg-shell-card shadow-[var(--shell-pop-shadow)] backdrop-blur-xl",
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
              {collapsed ? <PanelLeftOpen className="size-[17px]" /> : <PanelLeftClose className="size-[17px]" />}
            </button>
          }
        />
      </div>
    </aside>
  )
}
