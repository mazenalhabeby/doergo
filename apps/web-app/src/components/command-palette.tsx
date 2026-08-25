"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  Plus,
  Search,
  Archive,
  type LucideIcon,
} from "lucide-react"

import { searchApi } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { STATUS_CONFIG } from "@/lib/constants"
import { cn } from "@/lib/utils"

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command"
import { useCommandPalette, type CommandAction } from "@/contexts/command-palette-context"
import { useAuth } from "@/contexts/auth-context"
import { useActivityPanel } from "@/contexts/activity-panel-context"

// ---------------------------------------------------------------------------
// Kbd badge component
// ---------------------------------------------------------------------------

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

// ---------------------------------------------------------------------------
// Group label keys
// ---------------------------------------------------------------------------

const GROUP_LABEL_KEYS: Record<string, string> = {
  navigation: "commandPalette.groups.navigation",
  tasks: "commandPalette.groups.tasks",
  sprints: "commandPalette.groups.sprints",
  spaces: "commandPalette.groups.spaces",
  "quick-actions": "commandPalette.groups.quickActions",
}

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const { open, setOpen, actions } = useCommandPalette()
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { toggle: toggleActivity } = useActivityPanel()
  const { t } = useTranslation()

  // --- Live global search (debounced) ---
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(h)
  }, [query])
  // Clear the query whenever the palette closes.
  useEffect(() => {
    if (!open) { setQuery(""); setDebounced("") }
  }, [open])

  const { data: results, isFetching } = useQuery({
    queryKey: ["globalSearch", debounced],
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

    if (user.canManageUsers) {
      nav.push({
        id: "nav-spaces",
        label: t("commandPalette.goToSpaces"),
        icon: MapPin,
        group: "navigation",
        shortcut: "G then S",
        onSelect: () => router.push("/locations"),
      })
    }

    if (user.canViewAllTasks) {
      nav.push({
        id: "nav-schedule",
        label: t("commandPalette.goToSchedule"),
        icon: Calendar,
        group: "navigation",
        onSelect: () => router.push("/employees/availability"),
      })
      nav.push({
        id: "nav-attendance",
        label: t("commandPalette.goToAttendance"),
        icon: Clock,
        group: "navigation",
        onSelect: () => router.push("/attendance"),
      })
    }

    if (user.canManageUsers) {
      nav.push({
        id: "nav-members",
        label: t("commandPalette.goToMembers"),
        icon: Users,
        group: "navigation",
        onSelect: () => router.push("/members"),
      })
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
  }, [user, router, pathname, theme, setTheme, toggleActivity, t])

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
      const f = ql
        ? list.filter((a) => `${a.label} ${a.description || ""}`.toLowerCase().includes(ql))
        : list
      if (f.length) out.push([key, f])
    }
    return out
  }, [grouped, ql])

  const resultRow = (
    key: string,
    Icon: LucideIcon,
    label: string,
    sub: string | null,
    onSelect: () => void,
  ) => (
    <CommandItem key={key} value={key} onSelect={onSelect} className="gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/50">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium truncate">{label}</span>
        {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
      </div>
    </CommandItem>
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput placeholder={t("commandPalette.placeholder")} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{isFetching ? t("commandPalette.searching", "Searching…") : t("common.noResults")}</CommandEmpty>

        {/* Live search results */}
        {results?.members?.length ? (
          <CommandGroup heading={t("commandPalette.groups.people", "People")}>
            {results.members.map((m) => (
              <CommandItem key={`member-${m.id}`} value={`member-${m.id}`} onSelect={() => navigate(`/members/${m.id}`)} className="gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                <UserAvatar size="md" firstName={m.firstName} lastName={m.lastName} avatarUrl={m.avatarUrl} seed={m.id} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">{`${m.firstName} ${m.lastName}`.trim() || m.email || "—"}</span>
                  {m.email && <span className="text-xs text-muted-foreground truncate">{m.email}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {results?.tasks?.length ? (
          <CommandGroup heading={t("commandPalette.groups.tasksResults", "Tasks")}>
            {results.tasks.map((tk) => {
              const cfg = (STATUS_CONFIG as Record<string, { label: string; className: string }>)[tk.status]
              return (
                <CommandItem key={`task-${tk.id}`} value={`task-${tk.id}`} onSelect={() => navigate(`/tasks/${tk.id}`)} className="gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/50">
                    <ClipboardList className="size-4 text-muted-foreground" />
                  </div>
                  <span className="flex-1 min-w-0 truncate text-sm font-medium">{tk.title}</span>
                  {cfg && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", cfg.className)}>{cfg.label}</span>}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}
        {results?.spaces?.length ? (
          <CommandGroup heading={t("commandPalette.groups.spaces", "Workspaces")}>
            {results.spaces.map((s) => resultRow(`space-${s.id}`, MapPin, s.name, s.address, () => navigate(`/locations/${s.id}`)))}
          </CommandGroup>
        ) : null}

        {/* Static commands (filtered by the query) */}
        {staticGroups.map(([groupKey, groupActions]) => (
          <CommandGroup
            key={groupKey}
            heading={GROUP_LABEL_KEYS[groupKey] ? t(GROUP_LABEL_KEYS[groupKey]) : groupKey}
          >
            {groupActions.map((action) => {
              const Icon = action.icon
              return (
                <CommandItem
                  key={action.id}
                  value={`cmd-${action.id}`}
                  onSelect={() => handleSelect(action.id)}
                  className="gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
                >
                  {Icon && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/50">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{action.label}</span>
                    {action.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        {action.description}
                      </span>
                    )}
                  </div>
                  {action.shortcut && (
                    <CommandShortcut>
                      <Kbd>{action.shortcut}</Kbd>
                    </CommandShortcut>
                  )}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>

      {/* Footer hint */}
      <div className="flex items-center justify-between border-t border-border/50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Kbd>&uarr;&darr;</Kbd>
          <span>{t("commandPalette.navigate")}</span>
          <Kbd>&crarr;</Kbd>
          <span>{t("commandPalette.select")}</span>
          <Kbd>Esc</Kbd>
          <span>{t("common.close")}</span>
        </div>
      </div>
    </CommandDialog>
  )
}
