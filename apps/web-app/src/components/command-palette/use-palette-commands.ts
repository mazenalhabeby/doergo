"use client"

import { useRouteAccess } from "@/hooks/use-route-access"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  Calendar,
  Clock,
  Users,
  Settings,
  Sun,
  Moon,
  PanelRight,
} from "lucide-react"
import { searchApi } from "@/lib/api"
import { useCommandPalette, type CommandAction } from "@/contexts/command-palette-context"
import { useAuth } from "@/contexts/auth-context"
import { useActivityPanel } from "@/contexts/activity-panel-context"
import { keys } from "@/lib/query-keys"

/**
 * What the command palette offers: the live search, the navigation and quick commands (filtered by
 * the query) and what selecting one does.
 */
export function usePaletteCommands() {
  const { open, setOpen, actions } = useCommandPalette()
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { toggle: toggleActivity } = useActivityPanel()
  const { t } = useTranslation()

  // --- Live global search (debounced) ---
  const [query, setQuery] = useState("")
  const settled = useDebouncedValue(query.trim(), 250)
  // An empty box is empty at once — reopening the palette must not briefly
  // search the last term while the settled value catches up.
  const debounced = query.trim() ? settled : ""
  // Clear the query whenever the palette closes.
  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const { data: results, isFetching } = useQuery({
    queryKey: keys.search.global(debounced),
    queryFn: () => searchApi.global(debounced),
    enabled: open && debounced.length >= 2,
    staleTime: 15_000,
  })

  const navigate = useCallback(
    (path: string) => {
      setOpen(false)
      requestAnimationFrame(() => router.push(path))
    },
    [router, setOpen],
  )

  const { offers } = useRouteAccess()

  // --- Build base navigation actions ---
  const baseActions = useMemo<CommandAction[]>(() => {
    if (!user) return []

    const nav: CommandAction[] = [
      {
        id: "nav-dashboard",
        label: t("commandPalette.goToDashboard"),
        icon: LayoutDashboard,
        group: "navigation",
        shortcut: "G then D",
        onSelect: () => router.push("/dashboard"),
      },
      {
        id: "nav-tasks",
        label: t("commandPalette.goToTasks"),
        icon: ClipboardList,
        group: "navigation",
        shortcut: "G then T",
        onSelect: () => router.push("/tasks"),
      },
    ]

    // Asked of the route table, like the navbar — a command never leads to a refusal.
    if (offers("/locations")) {
      nav.push({
        id: "nav-spaces",
        label: t("commandPalette.goToSpaces"),
        icon: MapPin,
        group: "navigation",
        shortcut: "G then S",
        onSelect: () => router.push("/locations"),
      })
    }

    if (offers("/schedule")) {
      nav.push({
        id: "nav-schedule",
        label: t("commandPalette.goToSchedule"),
        icon: Calendar,
        group: "navigation",
        onSelect: () => router.push("/schedule"),
      })
    }
    if (offers("/attendance")) {
      nav.push({
        id: "nav-attendance",
        label: t("commandPalette.goToAttendance"),
        icon: Clock,
        group: "navigation",
        onSelect: () => router.push("/attendance"),
      })
    }

    if (offers("/members")) {
      nav.push({
        id: "nav-members",
        label: t("commandPalette.goToMembers"),
        icon: Users,
        group: "navigation",
        onSelect: () => router.push("/members"),
      })
    }
    {
      nav.push({
        id: "nav-settings",
        label: t("commandPalette.goToSettings"),
        icon: Settings,
        group: "navigation",
        onSelect: () => router.push("/settings"),
      })
    }

    // Quick actions
    const quick: CommandAction[] = [
      {
        id: "toggle-theme",
        label: theme === "dark" ? t("commandPalette.switchToLight") : t("commandPalette.switchToDark"),
        icon: theme === "dark" ? Sun : Moon,
        group: "quick-actions",
        onSelect: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
    ]

    // Activity panel toggle only on dashboard
    if (pathname === "/dashboard") {
      quick.push({
        id: "toggle-activity",
        label: t("commandPalette.toggleActivityPanel"),
        icon: PanelRight,
        group: "quick-actions",
        onSelect: toggleActivity,
      })
    }

    return [...nav, ...quick]
  }, [user, offers, router, pathname, theme, setTheme, toggleActivity, t])

  // Merge base actions with page-registered actions
  const allActions = useMemo(() => {
    // Deduplicate: page-registered actions override base actions with same id
    const map = new Map<string, CommandAction>()
    for (const a of baseActions) map.set(a.id, a)
    for (const a of actions) map.set(a.id, a)
    return Array.from(map.values())
  }, [baseActions, actions])

  // Group actions
  const grouped = useMemo(() => {
    const groups = new Map<string, CommandAction[]>()
    for (const action of allActions) {
      const list = groups.get(action.group) || []
      list.push(action)
      groups.set(action.group, list)
    }
    return groups
  }, [allActions])

  // Handle selection
  const handleSelect = useCallback(
    (actionId: string) => {
      const action = allActions.find((a) => a.id === actionId)
      if (action) {
        setOpen(false)
        // Small delay to let the dialog close before running the action
        // (prevents focus issues with dialogs opening from actions)
        requestAnimationFrame(() => {
          action.onSelect()
        })
      }
    },
    [allActions, setOpen],
  )

  // With cmdk filtering off (so remote results render verbatim), filter the
  // static commands ourselves. Empty query → show them all.
  const ql = query.trim().toLowerCase()
  const staticGroups = useMemo(() => {
    const out: [string, CommandAction[]][] = []
    for (const [key, list] of grouped.entries()) {
      const f = ql ? list.filter((a) => `${a.label} ${a.description || ""}`.toLowerCase().includes(ql)) : list
      if (f.length) out.push([key, f])
    }
    return out
  }, [grouped, ql])

  return {
    open,
    setOpen,
    query,
    setQuery,
    results,
    isFetching,
    navigate,
    handleSelect,
    staticGroups,
  }
}
