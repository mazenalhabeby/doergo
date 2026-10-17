"use client"

import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useOverflowNav } from "@/hooks/use-overflow-nav"
import { NAV_OPTION } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { mayListOrgMembers } from "@/lib/assignable-members"
import { useScheduleAccess } from "@/hooks/use-schedule-access"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useSyncLocale } from "@/hooks/use-sync-locale"
import { usePrefetchRoutes } from "./top-navbar/use-prefetch-routes"

/** TopNavbar's state and handlers — everything before its markup, moved here unchanged. */
export function useTopNavbar() {
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
  const prefetch = usePrefetchRoutes(mayListOrgMembers(user))
  const { t, i18n } = useTranslation()

  // Measured overflow for the navigation row (see hooks/use-overflow-nav).
  // Re-measures whenever the language changes, because that changes every width.
  const { containerRef: navRef, overflow: navOverflow } = useOverflowNav(i18n.language)

  return {
    user,
    logout,
    optionAllows,
    scheduleAccess,
    routeAccess,
    pathname,
    resolvedTheme,
    prefetch,
    t,
    navRef,
    navOverflow,
  }
}

/** What TopNavbar and its sections read. */
export type TopNavbarState = ReturnType<typeof useTopNavbar>
