"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"
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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("commandPalette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("common.noResults")}</CommandEmpty>
        {Array.from(grouped.entries()).map(([groupKey, groupActions]) => (
          <CommandGroup
            key={groupKey}
            heading={GROUP_LABEL_KEYS[groupKey] ? t(GROUP_LABEL_KEYS[groupKey]) : groupKey}
          >
            {groupActions.map((action) => {
              const Icon = action.icon
              return (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.description || ""}`}
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
