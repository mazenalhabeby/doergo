import { Shimmer as S } from "./primitives";
import { cn } from "@/lib/utils";

// Page wrapper
export const PAGE_OUTER = "min-h-full bg-background animate-in fade-in duration-200"

export const PAGE_INNER = "max-w-screen-xl mx-auto px-6 py-8"

// ============================================================================
// Shared Building Blocks
// ============================================================================

/** Page header: large title + subtitle + action buttons in a row */
export function PageHeader({
  titleW = "w-52",
  controls = 3,
  hasAction = true,
}: {
  titleW?: string
  controls?: number
  hasAction?: boolean
}) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between">
        <div>
          <S className={cn("h-9 rounded-lg", titleW)} />
          <S className="h-4 w-64 rounded-lg mt-2" />
        </div>
        <div className="flex items-center gap-3">
          {Array.from({ length: controls }).map((_, i) => (
            <S key={i} className="h-11 w-32 rounded-xl" />
          ))}
          {hasAction && <S className="h-11 w-36 rounded-xl" />}
        </div>
      </div>
    </div>
  )
}

/** Summary line above table */
export function SummaryLine() {
  return (
    <div className="mb-4">
      <S className="h-4 w-48 rounded" />
    </div>
  )
}

/** Tab strip with shadow */
export function TabStrip({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-1.5 bg-card rounded-xl border border-border shadow-sm p-1 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <S key={i} className={cn("h-9 rounded-lg", i === 0 ? "w-24" : "w-20")} />
      ))}
    </div>
  )
}

/** Simple table (no avatars) */
export function SimpleTableSkeleton({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center gap-4 px-6 py-3.5 bg-muted/50 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <S
            key={i}
            className={cn("h-4 rounded flex-1", i === 0 ? "max-w-[140px]" : "max-w-[100px]", i === cols - 1 && "max-w-[48px] ml-auto")}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-6 py-4 border-b border-border/50 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <S
              key={c}
              className={cn("h-4 rounded flex-1", c === 0 ? "max-w-[140px]" : "max-w-[100px]", c === cols - 1 && "max-w-[48px] ml-auto")}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Stat cards row */
export function StatsRow({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("grid gap-4 mb-6", count <= 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-3">
            <S className="w-11 h-11 rounded-xl" />
            <div className="space-y-1.5">
              <S className="w-16 h-3.5 rounded" />
              <S className="w-10 h-6 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Card skeleton */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
      <S className="h-5 w-32 rounded" />
      {Array.from({ length: lines }).map((_, i) => (
        <S key={i} className={cn("h-4 rounded", i === 0 ? "w-full" : i === 1 ? "w-3/4" : "w-1/2")} />
      ))}
    </div>
  )
}

/** Pagination bar */
export function PaginationBar() {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-border">
      <S className="h-4 w-28 rounded" />
      <div className="flex gap-2">
        <S className="h-8 w-20 rounded-lg" />
        <S className="h-8 w-16 rounded-lg" />
      </div>
    </div>
  )
}

/** Task detail page */
export function TaskDetailPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      {/* max-w-7xl and p-8 match the real page — a 6xl skeleton shifted the
          whole column sideways the moment the task arrived. */}
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Back + title row */}
        <div className="flex items-center gap-3">
          <S className="h-9 w-9 rounded-lg" />
          <S className="h-8 w-56 rounded-lg" />
          <S className="h-6 w-20 rounded-full ml-2" />
          <div className="ml-auto flex gap-2">
            <S className="h-11 w-28 rounded-xl" />
            <S className="h-11 w-11 rounded-xl" />
          </div>
        </div>
        {/* Progress card */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <S className="w-9 h-9 rounded-full" />
                <S className="w-20 h-3.5 rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* 60/40 split */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <CardSkeleton lines={6} />
            <CardSkeleton lines={3} />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <CardSkeleton lines={8} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Create task page */
export function TaskNewPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        <div className="mb-8">
          <S className="h-9 w-44 rounded-lg" />
          <S className="h-4 w-64 rounded-lg mt-2" />
        </div>
        <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <S className="h-4 w-24 rounded" />
              <S className="h-12 w-full rounded-xl" />
            </div>
          ))}
          <S className="h-11 w-36 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

/** Employee detail page */
export function EmployeeDetailPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        {/* Back button */}
        <S className="h-9 w-40 rounded-lg mb-6" />

        {/* Profile Header */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex gap-6">
              <S className="w-24 h-24 rounded-full flex-shrink-0" />
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <S className="h-7 w-44 rounded-lg" />
                  <S className="h-5 w-20 rounded-full" />
                  <S className="h-5 w-16 rounded-full" />
                </div>
                <div className="flex items-center gap-4">
                  <S className="h-4 w-48 rounded" />
                  <S className="h-4 w-28 rounded" />
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <S key={i} className="w-5 h-5 rounded" />
                  ))}
                  <S className="w-8 h-4 rounded ml-1" />
                  <S className="w-16 h-4 rounded" />
                </div>
              </div>
            </div>
            <S className="h-10 w-10 rounded-lg" />
          </div>
        </div>

        {/* Tabs */}
        <TabStrip count={7} />
        <StatsRow count={4} />
        <CardSkeleton lines={4} />
      </div>
    </div>
  )
}

/** New employee page */
export function EmployeeNewPageSkeleton() {
  return <TaskNewPageSkeleton />
}

/** A month as a 7-column grid: the weekday row, then five weeks. */
export function CalendarGridSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-5">
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <S key={i} className="h-6 w-full rounded" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <S key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
