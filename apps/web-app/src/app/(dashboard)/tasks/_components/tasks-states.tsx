"use client"

import { useTranslation } from "react-i18next"
import { ClipboardList, Plus, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

/** The list failed to load — say so, and offer to try again. */
export function TasksErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="rounded-[24px] bg-card px-5 py-12 text-center shadow-shell">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)]">
          <ClipboardList className="size-7 text-shell-crit" />
        </div>
        <p className="text-base font-semibold text-foreground">{t("tasks.list.failedToLoad")}</p>
        <p className="text-sm text-muted-foreground">{(error as Error)?.message}</p>
        <Button variant="outline" size="pill" onClick={onRetry} className="mt-2">
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
    <div className="rounded-[24px] bg-card px-5 py-12 text-center shadow-shell">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-shell-chip">
          <ClipboardList className="size-7 text-muted-foreground" />
        </div>
        <p className="text-base font-semibold text-foreground">{t("tasks.list.noTasksFound")}</p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {filtered ? t("tasks.page.adjustFilters") : t("tasks.list.createFirstTask")}
        </p>
        {canCreate && (
          <Button size="pill" onClick={onCreateTask} className="mt-2">
            <Plus className="size-4 mr-1.5" />
            {t("tasks.menu.newTask")}
          </Button>
        )}
      </div>
    </div>
  )
}
