"use client"

import type { RefObject } from "react"
import { useTranslation } from "react-i18next"
import { Search, Plus, Repeat } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { VIEW_OPTIONS, type ViewMode } from "../_lib/task-list"

/** Heading, search, view switch, the Recurring toggle and New Task. */
export function TasksPageHeader({
  isLoading,
  total,
  searchInputRef,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  showRecurringToggle,
  recurringView,
  onToggleRecurring,
  canCreateTasks,
  billingLocked,
  billingLockReason,
  onCreateTask,
}: {
  isLoading: boolean
  total: number
  searchInputRef: RefObject<HTMLInputElement | null>
  searchQuery: string
  onSearchChange: (value: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  showRecurringToggle: boolean
  recurringView: boolean
  onToggleRecurring: () => void
  canCreateTasks: boolean
  billingLocked: boolean
  billingLockReason: string | undefined
  onCreateTask: () => void
}) {
  const { t } = useTranslation()

  return (
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {t("tasks.page.heading")} {!isLoading && total > 0 && <span className="text-muted-foreground font-normal text-lg">({total})</span>}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks.page.subtitle")}
              </p>
            </div>

            <div className="flex items-center gap-3">

          {/* Sprint and Epic filters removed — use "Group by: Sprint/Epic" instead */}


          {/* Search */}
          <div className="relative" data-tour="tasks-search">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder={t("tasks.page.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={cn(
                "pl-9 w-44 h-8 bg-muted/50 border-0 rounded-lg text-sm",
                "focus:w-56 focus:bg-card focus:border-border focus:ring-1 focus:ring-ring",
                "transition-all duration-200"
              )}
            />
          </div>

          {/* View mode toggle buttons */}
          <div className="flex items-center rounded-lg border border-border/60 overflow-hidden" data-tour="tasks-views">
            {VIEW_OPTIONS.map(({ mode, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => onViewModeChange(mode)}
                data-tour={`tasks-view-${mode}`}
                title={t(`tasks.view.${mode}`)}
                className={cn(
                  "h-8 w-8 flex items-center justify-center transition-colors duration-150",
                  viewMode === mode
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>

          {/* Recurring view toggle (admins, Professional+) */}
          {showRecurringToggle && (
            <Button
              size="sm"
              variant={recurringView ? "default" : "outline"}
              onClick={onToggleRecurring}
              className={cn(
                "h-8 px-3.5 rounded-lg font-medium text-sm",
                recurringView && "bg-blue-600 text-white hover:bg-blue-700",
              )}
            >
              <Repeat className="size-4 mr-1.5" />
              {t("tasks.page.recurring")}
            </Button>
          )}

          {/*
            Create Task — disabled while the account is read-only.

            The server already refuses the write with 402; this only moves the
            refusal to before the typing. A locked account with a bug in the
            hook is still locked.
          */}
          {canCreateTasks && (
            <Button
              size="sm"
              disabled={billingLocked}
              title={billingLocked ? billingLockReason : undefined}
              onClick={onCreateTask}
              data-tour="tasks-create"
              className="h-8 px-3.5 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-150"
            >
              <Plus className="size-4 mr-1.5" />
              {t("tasks.page.newTask")}
            </Button>
          )}
            </div>
          </div>
        </div>
  )
}
