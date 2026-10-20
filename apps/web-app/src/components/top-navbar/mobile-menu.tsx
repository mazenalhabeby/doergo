"use client"

import Link from "next/link"
import { useState } from "react"
import {
  LayoutDashboard,
  Settings,
  MapPin,
  Calendar,
  Clock,
  Menu,
  AlertTriangle,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMySections } from "@/hooks/use-my-sections"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { isActive } from "./nav-active"
import { mobileItemBase, mobileItemInactive, mobileItemActiveStyle } from "./nav-styles"
import { useTeamLabels } from "./use-team-labels"

// ---------------------------------------------------------------------------
// Mobile Menu
// ---------------------------------------------------------------------------
export function MobileMenu({
  pathname,
  showTeam,
  showSpaces,
  showSchedule,
  showAttendance,
  showOvertime,
  showReports,
  showInvoices,
  showMyDocuments,
  showIssueDocuments,
  showDocumentTemplates,
  showDocumentCompliance,
  showManage,
  showCrm,
  showCalendar,
  showIssues,
  showAssets,
  showPortals,
  teamItems,
}: {
  pathname: string
  teamItems: string[]
  showTeam: boolean
  showSpaces: boolean
  showSchedule: boolean
  showAttendance: boolean
  showOvertime: boolean
  showIssues: boolean
  showReports: boolean
  showInvoices: boolean
  showManage: boolean
  showCrm?: boolean
  showCalendar?: boolean
  showAssets?: boolean
  showPortals?: boolean
  showMyDocuments: boolean
  showIssueDocuments: boolean
  showDocumentTemplates: boolean
  showDocumentCompliance: boolean
}) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  // The same definition the desktop menu and the section's tabs read.
  const mySections = useMySections()

  const teamLabels = useTeamLabels()

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={"md:hidden mr-2 flex items-center justify-center h-8 w-8 rounded-md " +
          "text-muted-foreground hover:text-foreground hover:bg-muted/50 " +
          "transition-colors outline-none"}>
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

        {showCalendar && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link
              href="/calendar"
              onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/calendar") ? mobileItemActiveStyle : mobileItemInactive)}
            >
              {t("nav.sidebar.calendar")}
            </Link>
          </DropdownMenuItem>
        )}

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

        {/* Assets and Portals — added here at the same time as the desktop bar,
            so neither is reachable on one width and missing on the other. */}
        {showAssets && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link
              href="/assets"
              onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/assets") ? mobileItemActiveStyle : mobileItemInactive)}
            >
              {t("nav.assets", "Assets")}
            </Link>
          </DropdownMenuItem>
        )}

        {showPortals && (
          <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
            <Link
              href="/portals"
              onClick={() => setOpen(false)}
              className={cn(mobileItemBase, isActive(pathname, "/portals") ? mobileItemActiveStyle : mobileItemInactive)}
            >
              {t("nav.portals", "Portals")}
            </Link>
          </DropdownMenuItem>
        )}

        {showTeam && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("nav.team")}
            </DropdownMenuLabel>
            {teamItems.map((href) => (
              <DropdownMenuItem key={href} asChild className="rounded-md cursor-pointer p-0">
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(mobileItemBase, "pl-5", isActive(pathname, href) ? mobileItemActiveStyle : mobileItemInactive)}
                >
                  {teamLabels[href]}
                </Link>
              </DropdownMenuItem>
            ))}
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

        {(showSchedule || showAttendance || showOvertime) && (
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
            {showIssues && (
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
            )}
            {showSchedule && (
              <DropdownMenuItem asChild className="rounded-md cursor-pointer p-0">
                <Link
                  href="/schedule"
                  onClick={() => setOpen(false)}
                  className={cn(
                    mobileItemBase,
                    "pl-5",
                    isActive(pathname, "/schedule")
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
            {/* Same gate as the wide bar: every overtime route asks
                `canApproveOvertime`, reads included. */}
            {showOvertime && (
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
        {/* The member's own pages — the same three the Me menu holds on desktop. */}
        {mySections.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("nav.me", "Me")}
            </DropdownMenuLabel>
            {mySections.map((sec) => (
              <DropdownMenuItem key={sec.href} asChild className="rounded-md cursor-pointer p-0">
                <Link
                  href={sec.href}
                  onClick={() => setOpen(false)}
                  className={cn(mobileItemBase, "pl-5", isActive(pathname, sec.href) ? mobileItemActiveStyle : mobileItemInactive)}
                >
                  {sec.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
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
