"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Shimmer as S } from "@/components/skeletons/primitives"

/**
 * Loading states for the task list, one per view.
 *
 * These lived inline in tasks/page.tsx — ~80 lines with the same 200-character
 * shimmer class pasted about twenty times, which is also why only three of the
 * page's regions ever got one. Here each view is a small function over the
 * shared Shimmer, and the route-level loader can render the same shapes.
 */

/** Where the page remembers the chosen view. Shared so the two cannot drift. */
export const VIEW_MODE_STORAGE_KEY = "hbcfield-tasks-view-mode"

export type TaskViewMode = "table" | "board" | "schedule"

/** What a first-time visitor sees, and the fallback when storage is unreadable. */
export const DEFAULT_VIEW_MODE: TaskViewMode = "board"

/**
 * The view the page will open in, so the route-level skeleton draws that one
 * rather than a shape the user then watches re-arrange. This is the single
 * reader — the page initialises its own state from it too.
 */
export function readStoredViewMode(): TaskViewMode {
  if (typeof window === "undefined") return DEFAULT_VIEW_MODE
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    return stored === "board" || stored === "schedule" || stored === "table"
      ? stored
      : DEFAULT_VIEW_MODE
  } catch {
    // Private mode / storage disabled — the default still applies.
    return DEFAULT_VIEW_MODE
  }
}

/** Column widths of the table header, matching the real one. */
const HEAD_COLS = ["w-48", "w-20", "w-28", "w-20", "w-24", "w-8"]

function TableSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden animate-in fade-in duration-300">
      <div className="flex items-center gap-4 px-5 py-3 bg-muted/40 border-b border-border/40">
        <div className="w-8" />
        {HEAD_COLS.map((w, i) => (
          <S key={i} className={`h-3.5 rounded ${w}`} delayMs={i * 40} />
        ))}
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-5 py-3.5 border-b border-border/20 last:border-0"
        >
          <S className="size-4 rounded-full" delayMs={i * 50} />
          {/* Varied title widths so the rows don't read as a barcode. */}
          <S className="h-4 rounded" style={{ width: `${140 + ((i * 17) % 80)}px` }} delayMs={i * 50} />
          <S className="h-4 w-14 rounded" delayMs={i * 50} />
          <div className="flex items-center gap-2">
            <S className="size-6 rounded-full" delayMs={i * 50} />
            <S className="h-3.5 w-20 rounded" delayMs={i * 50} />
          </div>
          <S className="h-3.5 w-16 rounded" delayMs={i * 50} />
          <S className="h-5 w-20 rounded-full" delayMs={i * 50} />
        </div>
      ))}
    </div>
  )
}

/** Placeholder columns. Real column names arrive with the workflow. */
const FALLBACK_COLUMNS = ["open", "assigned", "active", "blocked", "done"] as const

function BoardSkeleton() {
  const { t } = useTranslation()
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 animate-in fade-in duration-300">
      {FALLBACK_COLUMNS.map((key, i) => (
        <div key={key} className="flex-shrink-0 w-[280px]">
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="size-2 rounded-full bg-muted" />
            <span className="text-sm font-semibold text-muted-foreground/30">
              {t(`tasks.fallbackColumns.${key}`)}
            </span>
          </div>
          <div className="space-y-2 p-2 rounded-xl bg-muted/50 border border-border/30">
            {Array.from({ length: 2 + (i % 2) }).map((_, j) => {
              const delay = (i * 3 + j) * 60
              return (
                <div key={j} className="p-3.5 rounded-xl bg-card border border-border/50">
                  <S className="h-4 w-full rounded mb-2.5" delayMs={delay} />
                  <S className="h-3 w-16 rounded mb-3" delayMs={delay} />
                  <div className="flex justify-between items-center">
                    <S className="size-5 rounded-full" delayMs={delay} />
                    <S className="h-3 w-14 rounded" delayMs={delay} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScheduleSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden animate-in fade-in duration-300">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <S className="h-4 w-20 rounded" />
        <S className="h-7 w-40 rounded-lg" delayMs={80} />
      </div>
      <div className="flex" style={{ height: 400 }}>
        {/* Row labels */}
        <div className="w-[250px] border-r border-border/40">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-3 h-[50px] border-b border-border/10">
              <S className="size-1.5 rounded-full" delayMs={i * 45} />
              <S className="h-3 rounded" style={{ width: `${60 + ((i * 13) % 60)}px` }} delayMs={i * 45} />
            </div>
          ))}
        </div>
        {/* Bars, staggered across the timeline */}
        <div className="flex-1 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[50px] flex items-center">
              <S
                className="h-6 rounded-md"
                style={{ width: `${25 + ((i * 19) % 45)}%`, marginLeft: `${(i * 11) % 30}%` }}
                delayMs={i * 55}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The task list's loading state for a given view. */
export function TasksViewSkeleton({ view }: { view: TaskViewMode }) {
  if (view === "board") return <BoardSkeleton />
  if (view === "schedule") return <ScheduleSkeleton />
  return <TableSkeleton />
}

/**
 * Whole-page stand-in for the route-level loader: the header and toolbar the
 * page paints immediately, above the view the user left it in.
 */
export function TasksPageLoading() {
  // localStorage is read AFTER mount, never during render: this component is
  // server-rendered, and reading it inline would make the server and the client
  // disagree about which view to draw — a hydration mismatch. The first paint
  // uses the default and corrects itself immediately.
  const [view, setView] = useState<TaskViewMode>(DEFAULT_VIEW_MODE)
  useEffect(() => setView(readStoredViewMode()), [])

  return (
    <div className="min-h-full bg-background animate-in fade-in duration-200">
      <div className="max-w-screen-2xl mx-auto px-6 py-6">
        {/* Heading + primary action */}
        <div className="flex items-start justify-between mb-5">
          <div className="space-y-2">
            <S className="h-7 w-40 rounded-lg" />
            <S className="h-3.5 w-64 rounded" delayMs={60} />
          </div>
          <div className="flex items-center gap-2">
            <S className="h-9 w-24 rounded-lg" delayMs={40} />
            <S className="h-9 w-28 rounded-lg" delayMs={80} />
          </div>
        </div>

        {/* Filter row + view switcher */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <S className="h-9 w-56 rounded-lg" />
          {[20, 24, 20, 28].map((w, i) => (
            <S key={i} className="h-9 rounded-lg" style={{ width: w * 4 }} delayMs={40 + i * 40} />
          ))}
          <div className="ml-auto flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <S key={i} className="h-9 w-9 rounded-lg" delayMs={i * 50} />
            ))}
          </div>
        </div>

        <TasksViewSkeleton view={view} />
      </div>
    </div>
  )
}
