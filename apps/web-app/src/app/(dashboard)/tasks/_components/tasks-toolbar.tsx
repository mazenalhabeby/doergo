"use client"

import type { ReactNode, RefObject } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { VIEW_OPTIONS, type ViewMode } from "../_lib/task-list"
import { SearchPill } from "@/components/page/page-controls"

/** The pill segment a page switches views with (List / Board / Schedule), the boards' `kseg`. */
const SEG = "inline-flex gap-0.5 rounded-full bg-shell-chip p-1"
const SEG_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium text-muted-foreground " +
  "outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
const SEG_ON = "bg-card font-semibold text-foreground shadow-shell"

/** The row over the list: the slice on the left (`children`), then search and the view switch on the right. */
export function TasksToolbar({
  searchInputRef,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  children,
}: {
  searchInputRef: RefObject<HTMLInputElement | null>
  searchQuery: string
  onSearchChange: (value: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  children?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-0.5">{children}</div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SearchPill
          ref={searchInputRef}
          tour="tasks-search"
          className="w-[220px]"
          placeholder={t("tasks.page.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        <div className={SEG} role="group" data-tour="tasks-views">
          {VIEW_OPTIONS.map(({ mode }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => onViewModeChange(mode)}
              data-tour={`tasks-view-${mode}`}
              className={cn(SEG_BTN, viewMode === mode && SEG_ON)}
            >
              {t(`tasks.view.${mode}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
