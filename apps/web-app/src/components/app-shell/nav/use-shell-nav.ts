"use client"

import { useCallback, useMemo } from "react"
import { NAV_OPTION } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"
import { NAV_SECTIONS, visibleSections, type NavSection } from "./nav-config"

/**
 * The sections THIS member gets — `nav-config.ts` filtered by one question per href:
 *   • the route table (`routeAccess.offers` — the same rule the layout uses to refuse a typed URL, so the
 *     menu never leads to a page whose every request 403s);
 *   • the Option that owns the page (`NAV_OPTION` — what the organization bought, the same check PlanGate
 *     uses);
 *   • Manage only for whoever has no Team pages (it repeats them — `NavModel.manage`).
 * Hiding a row is a convenience, never the protection: the server refuses the page's requests either way.
 */
export function useShellNav(): NavSection[] {
  const { hasPlanFeature } = useAuth()
  const routeAccess = useRouteAccess()
  const nav = routeAccess.nav
  const { offers } = routeAccess

  const allow = useCallback(
    (href: string) => {
      if (!nav) return false
      if (href === "/manage") return nav.manage
      if (!offers(href)) return false
      const option = NAV_OPTION[href]
      return !option || hasPlanFeature(option)
    },
    [nav, offers, hasPlanFeature],
  )

  return useMemo(() => (nav ? visibleSections(NAV_SECTIONS, allow) : []), [nav, allow])
}
