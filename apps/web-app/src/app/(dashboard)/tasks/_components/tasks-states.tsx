"use client"

import { useTranslation } from "react-i18next"
import { ClipboardList, Plus, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

/** The list failed to load — say so, and offer to try again. */
export function TasksErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()

  return (
          <div className="bg-card rounded-xl border border-border/50 p-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="size-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <ClipboardList className="size-7 text-red-500" />
              </div>
              <p className="text-base font-semibold text-foreground">{t("tasks.list.failedToLoad")}</p>
              <p className="text-sm text-muted-foreground">{(error as Error)?.message}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="mt-2 rounded-lg"
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                {t("common.tryAgain")}
              </Button>
            </div>
          </div>
  )
}

/**
 * Nothing to show. With a filter on, the way out is the filter; with none,
 * it is the first task — offered only to somebody who may create one.
 */
export function TasksEmptyState({
  filtered,
  canCreate,
  onCreateTask,
}: {
  filtered: boolean
  canCreate: boolean
  onCreateTask: () => void
}) {
  const { t } = useTranslation()

  return (
          <div className="bg-card rounded-xl border border-border/50 p-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                <ClipboardList className="size-7 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground">{t("tasks.list.noTasksFound")}</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                {filtered
                  ? t("tasks.page.adjustFilters")
                  : t("tasks.list.createFirstTask")}
              </p>
              {canCreate && (
                <Button
                  size="sm"
                  onClick={onCreateTask}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white mt-2"
                >
                  <Plus className="size-4 mr-1.5" />
                  {t("tasks.menu.newTask")}
                </Button>
              )}
            </div>
          </div>
  )
}
