"use client"

import { useMemo } from "react"
import { useAuth } from "@/contexts/auth-context"
import {
  checkRoute,
  navModelFor,
  navOffers,
  settingsSectionsFor,
  evaluateRule,
  holdsGrant,
  type Grant,
  type AccessContext,
  type AccessRule,
  type AccessUser,
  type AccessVerdict,
  type NavModel,
} from "@/lib/route-access"

/**
 * The route table, bound to the signed-in member.
 *
 * `ctx` is null while nobody is signed in — every answer is then "no", which is
 * what a page should assume before it knows who is asking.
 */
export function useRouteAccess() {
  const { user, hasPlanFeature } = useAuth()
  const ctx: AccessContext | null = useMemo(
    () => (user ? { user: user as unknown as AccessUser, hasOption: hasPlanFeature } : null),
    [user, hasPlanFeature],
  )
  return useMemo(() => {
    const deny: AccessVerdict = { ok: false, reason: "permission" }
    return {
      ctx,
      check: (pathname: string): AccessVerdict => (ctx ? checkRoute(pathname, ctx) : deny),
      may: (pathname: string): boolean => (ctx ? checkRoute(pathname, ctx).ok : false),
      offers: (href: string): boolean => (ctx ? navOffers(href, ctx) : false),
      /** One grant, asked the way its guard asks it — for a query's `enabled`. */
      holds: (grant: Grant): boolean => (ctx ? holdsGrant(ctx.user, grant) : false),
      allows: (rule: AccessRule): boolean => (ctx ? evaluateRule(rule, ctx).ok : false),
      nav: (ctx ? navModelFor(ctx) : null) as NavModel | null,
      settingsSections: ctx ? settingsSectionsFor(ctx) : [],
    }
  }, [ctx])
}
