"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"

/**
 * Which workspace a screen is looking at, when the screen belongs to no single
 * one.
 *
 * Clients, assets and portals are organization things that a workspace merely
 * switches ON. Burying them in one workspace's settings made "show me our
 * clients" four clicks and a guess about which workspace to open first — so
 * they get their own address, and this decides what the workspace tabs offer.
 *
 * Three rules, all of them about not asking a question that has no answer:
 *
 *   • only workspaces where the MODULE is enabled appear — a space without CRM
 *     has no clients to show, and offering it teaches the tab row is unreliable
 *   • the row hides itself when there is nothing to choose between
 *   • the choice lives in the URL, so a filtered view is a link, the browser's
 *     back button works, and a workspace's own tab can deep-link into it
 *
 * The workspace list is the one the nav already loads and the server already
 * scoped, so this costs no request of its own: a member sees their sites and an
 * admin sees all of them, decided where it is always decided.
 */
export interface SpaceScope {
  /** Workspaces that have the module on — what the tab row should offer. */
  spaces: CompanyLocation[]
  /** The chosen workspace, or null for "All". */
  spaceId: string | null
  setSpaceId: (id: string | null) => void
  /** False while the workspace list is still loading. */
  ready: boolean
  /** A row with one option is furniture; the screen renders a label instead. */
  showTabs: boolean
  /** The chosen workspace itself, when one is chosen. */
  space: CompanyLocation | null
}

export function useSpaceScope(options: {
  /**
   * The module a workspace must have for this screen to mean anything.
   *
   * Optional, because not every screen that asks "which workspace" is about a
   * module. Schedule & Time Off is about PEOPLE: leave belongs to a person, not
   * to a feature, so filtering by `time_tracking` there would hide a workspace
   * that has a roster and pending leave merely because nobody clocks in at it —
   * and those requests would vanish from the chart with nothing to say they
   * had. Omitted = every active workspace.
   */
  module?: string
  /**
   * The ownership kind a workspace must be.
   *
   * ⚠️ Not every screen that belongs to a workspace belongs to a MODULE.
   * Invoicing is an organization Option, not a per-space module, and what
   * decides whether a workspace can be billed is what it IS: you invoice a
   * customer site, never your own warehouse. Offering an internal workspace
   * here would be a tab leading to a screen where nothing can be created —
   * the same failure the module filter exists to prevent, asked the other way.
   */
  kind?: string
  /**
   * Whether "All" is a real answer here.
   *
   * It is for clients and assets, whose lists the API can return unfiltered.
   * It is not for a client portal, which belongs to exactly one workspace —
   * so that screen opens on the first one rather than on a view that cannot
   * be fetched.
   */
  allowAll?: boolean
}): SpaceScope {
  const { module, kind, allowAll = true } = options
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  /*
    The same query key the rest of the app uses for this list, so opening one of
    these pages reuses whatever the nav or the dashboard already fetched instead
    of asking again.
  */
  const { data, isLoading } = useQuery({
    queryKey: ["locations", "list"],
    queryFn: () => locationsApi.list({ limit: 200 }),
    staleTime: 60000,
  })

  const spaces = useMemo(() => {
    const all: CompanyLocation[] = (data as { data?: CompanyLocation[] } | undefined)?.data ?? []
    return all.filter((s) => {
      if (s.isActive === false) return false
      // What a workspace IS, before what it has switched on.
      if (kind && s.kind !== kind) return false
      /*
        A space's own module list wins; an absent one means the space has never
        been configured and inherits the organization's — the same precedence
        `useSpaceModules` and the server's gates apply, written the same way
        round so the three cannot disagree.
      */
      if (!module) return true
      const mods = (Array.isArray(s.enabledModules) ? s.enabledModules : user?.orgModules ?? []) as string[]
      return mods.includes(module)
    })
  }, [data, module, kind, user?.orgModules])

  const param = searchParams.get("space")
  /*
    A workspace named in the URL that this member cannot see is not an error to
    show — it is a link from somewhere they no longer have access to. Falling
    back to All (or the first available) is what a person expects, and it never
    reveals that the id was real.
  */
  const valid = param && spaces.some((s) => s.id === param) ? param : null
  const spaceId = valid ?? (allowAll ? null : (spaces[0]?.id ?? null))

  const setSpaceId = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(Array.from(searchParams.entries()))
      if (id) next.set("space", id)
      else next.delete("space")
      const qs = next.toString()
      // replace, not push: flipping between workspaces is refining one view,
      // not a journey somebody wants to walk back through tab by tab.
      router.replace(qs ? `?${qs}` : "?", { scroll: false })
    },
    [router, searchParams],
  )

  /*
    Drop a stale `?space=` from the address rather than quietly ignoring it, so
    what the URL says and what the screen shows never disagree.
  */
  useEffect(() => {
    if (param && !isLoading && !valid) setSpaceId(null)
  }, [param, valid, isLoading, setSpaceId])

  return {
    spaces,
    spaceId,
    setSpaceId,
    ready: !isLoading,
    showTabs: spaces.length > 1,
    space: spaces.find((s) => s.id === spaceId) ?? null,
  }
}
