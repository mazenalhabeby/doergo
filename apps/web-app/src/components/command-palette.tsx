"use client"

import { personName } from "@hbcfield/shared/client"
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
import { keys } from "@/lib/query-keys"
import { useCommandPaletteLogic } from "./use-command-palette-logic"
import { Kbd, GROUP_LABEL_KEYS } from "./command-palette-helpers"

// ---------------------------------------------------------------------------
// Kbd badge component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const {
    open,
    setOpen,
    t,
    query,
    setQuery,
    results,
    isFetching,
    navigate,
    handleSelect,
    staticGroups,
    resultRow,
  } = useCommandPaletteLogic()

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput placeholder={t("commandPalette.placeholder")} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{isFetching ? t("commandPalette.searching", "Searching…") : t("common.noResults")}</CommandEmpty>

        {/* Live search results */}
        {results?.members?.length ? (
          <CommandGroup heading={t("commandPalette.groups.people", "People")}>
            {results.members.map((m) => (
              <CommandItem
                key={`member-${m.id}`}
                value={`member-${m.id}`}
                onSelect={() => navigate(`/members/${m.id}`)}
                className="gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                <UserAvatar size="md" firstName={m.firstName} lastName={m.lastName} avatarUrl={m.avatarUrl} seed={m.id} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">{personName(m) || m.email || "—"}</span>
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
                <CommandItem
                  key={`task-${tk.id}`}
                  value={`task-${tk.id}`}
                  onSelect={() => navigate(`/tasks/${tk.id}`)}
                  className="gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/50">
                    <ClipboardList className="size-4 text-muted-foreground" />
                  </div>
                  <span className="flex-1 min-w-0 truncate text-sm font-medium">{tk.title}</span>
                  {cfg &&
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", cfg.className)}>{cfg.label}</span>}
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
