"use client"

import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { isDropdownActive } from "./nav-active"
import { navItemBase, navItemInactive, navItemActiveStyle, bottomIndicator } from "./nav-styles"

// ---------------------------------------------------------------------------
// Time & Attendance Dropdown (management: attendance + schedule + time-off)
// ---------------------------------------------------------------------------
export function TimeAttendanceDropdown({
  pathname,
  showSchedule,
  showAttendance,
  showOvertime,
  showIssues,
  onOpen,
}: {
  pathname: string
  showSchedule: boolean
  showAttendance: boolean
  showOvertime: boolean
  showIssues: boolean
  onOpen?: () => void
}) {
  const { t } = useTranslation()
  /*
    Exactly the routes this menu contains. It listed "/my/time-off" — which moved out to its own top-level
    link — so on that page the standalone link AND this trigger both lit up,
    and the bar pointed at two places. It also omitted /issues and /overtime,
    which ARE in the menu, so on those pages it highlighted nothing.
  */
  const active = isDropdownActive(pathname, ["/attendance", "/schedule", "/overtime", "/issues"])

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
        {/*
          Offered to whoever the issues list will actually answer for.

          It was unconditional, so every member saw a menu entry that led to a
          page listing, at most, blockers they had reported themselves. The
          server now answers a supervisor with the issues on the sites they
          oversee — the same question `showAttendance` asks — so the entry
          follows that instead of being shown to everybody.
        */}
        {showIssues && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer">
            <Link href="/issues" className="flex items-center gap-2 px-2 py-1.5 text-sm">
              {t("nav.sidebar.issues", "Shift Issues")}
            </Link>
          </DropdownMenuItem>
        )}
        {showSchedule && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer">
            <Link href="/schedule" className="flex items-center gap-2 px-2 py-1.5 text-sm">
              {t("nav.sidebar.schedule")}
            </Link>
          </DropdownMenuItem>
        )}
        {/*
          Overtime requests and approvals.

          Gated on `canApproveOvertime` — the permission every route behind it
          asks, including the two READS (`pending-approvals`, `history`). It
          used to follow `showAttendance`, which is a different question, and
          got both directions wrong: somebody who could see attendance but not
          approve was sent to a page whose every request 403s, while somebody
          holding only `canApproveOvertime` had no link at all and could reach
          their own approvals queue only by typing the URL.
        */}
        {showOvertime && (
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
