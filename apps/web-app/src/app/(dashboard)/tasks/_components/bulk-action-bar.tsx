"use client"

import React, { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { X, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getStatusConfig, getPriorityConfig, TASK_STATUSES, TASK_PRIORITIES } from "@/lib/constants"
import type { Sprint } from "@/lib/api"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BulkActionBarProps {
  selectedIds: Set<string>
  sprints?: Sprint[]
  spaces?: { id: string; name: string }[]
  onClear: () => void
  onBulkStatusChange?: (taskIds: string[], status: string) => void
  onBulkPriorityChange?: (taskIds: string[], priority: string) => void
  onBulkSprintChange?: (taskIds: string[], sprintId: string | null) => void
  onBulkSpaceChange?: (taskIds: string[], spaceId: string | null) => void
  onBulkDelete?: (taskIds: string[]) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function BulkActionBarInner({
  selectedIds,
  sprints = [],
  spaces = [],
  onClear,
  onBulkStatusChange,
  onBulkPriorityChange,
  onBulkSprintChange,
  onBulkSpaceChange,
  onBulkDelete,
}: BulkActionBarProps) {
  const { t } = useTranslation()
  const { hasModule } = useAuth()
  const count = selectedIds.size
  const ids = Array.from(selectedIds)

  const handleDelete = useCallback(() => {
    if (window.confirm(`Delete ${count} task${count !== 1 ? "s" : ""}?`)) {
      onBulkDelete?.(ids)
    }
  }, [count, ids, onBulkDelete])

  if (count === 0) return null

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-2 px-4 py-2.5 rounded-xl",
        "bg-card/80 backdrop-blur-xl border border-border/60 shadow-xl",
        "animate-in slide-in-from-bottom-4 fade-in-0 duration-200",
      )}
      style={{ animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
    >
      {/* Count */}
      <span className="text-sm font-semibold text-foreground whitespace-nowrap pr-1">
        {count} selected
      </span>

      <div className="w-px h-5 bg-border/60 mx-1" />

      {/* Status */}
      {onBulkStatusChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
              {t("tasks.menu.status")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-[180px]">
            {TASK_STATUSES.filter(s => s !== "DRAFT").map((status) => {
              const config = getStatusConfig(status)
              return (
                <DropdownMenuItem
                  key={status}
                  onClick={() => onBulkStatusChange(ids, status)}
                >
                  <span
                    className="size-2 rounded-full mr-2 flex-shrink-0"
                    style={{ backgroundColor: config.hex }}
                  />
                  {config.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Priority */}
      {onBulkPriorityChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
              {t("tasks.menu.priority")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-[160px]">
            {TASK_PRIORITIES.map((priority) => {
              const config = getPriorityConfig(priority)
              const Icon = config.icon
              return (
                <DropdownMenuItem
                  key={priority}
                  onClick={() => onBulkPriorityChange(ids, priority)}
                >
                  <Icon className="size-3.5 mr-2 flex-shrink-0" style={{ color: config.hex }} />
                  {config.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Sprint */}
      {hasModule('sprints') && onBulkSprintChange && sprints.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
              {t("tasks.menu.sprint")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-[180px]">
            <DropdownMenuItem onClick={() => onBulkSprintChange(ids, null)}>
              {t("tasks.menu.backlog")}
            </DropdownMenuItem>
            {sprints.map((sprint) => (
              <DropdownMenuItem
                key={sprint.id}
                onClick={() => onBulkSprintChange(ids, sprint.id)}
              >
                {sprint.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Space */}
      {onBulkSpaceChange && spaces.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
              {t("tasks.menu.space")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-[180px]">
            <DropdownMenuItem onClick={() => onBulkSpaceChange(ids, null)}>
              {t("tasks.menu.noSpace")}
            </DropdownMenuItem>
            {spaces.map((space) => (
              <DropdownMenuItem
                key={space.id}
                onClick={() => onBulkSpaceChange(ids, space.id)}
              >
                {space.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="w-px h-5 bg-border/60 mx-1" />

      {/* Delete */}
      {onBulkDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs font-medium rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10"
          onClick={handleDelete}
        >
          <Trash2 className="size-3.5 mr-1" />
          {t("tasks.menu.delete")}
        </Button>
      )}

      {/* Clear */}
      <Button
        variant="ghost"
        size="icon"
        className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

export const BulkActionBar = React.memo(BulkActionBarInner)
