"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"
import { Menu } from "lucide-react"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SupportButton } from "@/components/support/support-widget"
import { HelpButton } from "@/components/tour"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useSyncLocale } from "@/hooks/use-sync-locale"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { cn } from "@/lib/utils"
import { ApprovalsButton } from "./approvals-button"
import { CommandPaletteButton } from "./command-palette-button"
import { MessagesButton } from "./messages-button"
import { SidebarBody } from "./sidebar/sidebar"
import { TopBarButton } from "./top-bar-icon"

/**
 * The top of the page panel: search (⌘K) on the left; on the right ONE group — what needs you (Approvals,
 * Messages, Notifications) and help. Below lg the menu button opens the same sidebar as a drawer.
 */
export function TopBar() {
  const { t } = useTranslation()
  // Notifications are written on the server in the reader's language.
  useSyncLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  // A page chosen any other way (⌘K, a link on the page) closes the drawer too.
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <header className="relative z-30 shrink-0 bg-background">
      {/* The page column (PAGE_WIDTH): search lines up with the page's own left edge. */}
      <div className={cn(PAGE_WIDTH, "flex items-center gap-2.5 py-3")}>
        <TopBarButton
          className="lg:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label={t("nav.openMenu", "Open the menu")}
          aria-expanded={menuOpen}
        >
          <Menu />
        </TopBarButton>
        <CommandPaletteButton />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label={t("nav.inbox", "What needs you")}
            className={cn(
              "flex h-11 items-center gap-0.5 rounded-full border border-shell-line bg-shell-card px-[3px]",
              "shadow-[var(--shell-shadow)]",
            )}
          >
            <ApprovalsButton />
            <MessagesButton />
            <NotificationBell />
            {/* On a phone these two live in the menu drawer — the bar keeps what needs you. */}
            <span className="hidden items-center gap-0.5 sm:flex">
              <span aria-hidden className="mx-0.5 h-5 w-px bg-shell-line" />
              <HelpButton />
              <SupportButton />
            </span>
          </div>
        </div>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="flex w-[300px] max-w-[85vw] flex-col bg-shell-card p-3 pr-2.5 sm:max-w-[300px]"
        >
          <SheetTitle className="sr-only">{t("nav.navigation", "Navigation")}</SheetTitle>
          {menuOpen && (
            <SidebarBody
              drawer
              onNavigate={() => setMenuOpen(false)}
              toggle={
                <span className="flex items-center gap-0.5 sm:hidden">
                  <HelpButton />
                  <SupportButton />
                </span>
              }
            />
          )}
        </SheetContent>
      </Sheet>
    </header>
  )
}
