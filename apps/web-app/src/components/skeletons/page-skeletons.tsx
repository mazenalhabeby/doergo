import { Shimmer as S } from './primitives';
import { cn } from "@/lib/utils"

// ============================================================================
// Base Shimmer Block
// ============================================================================


// Page wrapper
const PAGE_OUTER = "min-h-full bg-background animate-in fade-in duration-200"
const PAGE_INNER = "max-w-screen-xl mx-auto px-6 py-8"

// ============================================================================
// Shared Building Blocks
// ============================================================================

/** Page header: large title + subtitle + action buttons in a row */
function PageHeader({
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
function SummaryLine() {
  return (
    <div className="mb-4">
      <S className="h-4 w-48 rounded" />
    </div>
  )
}

/** Tab strip with shadow */
function TabStrip({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-1.5 bg-card rounded-xl border border-border shadow-sm p-1 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <S key={i} className={cn("h-9 rounded-lg", i === 0 ? "w-24" : "w-20")} />
      ))}
    </div>
  )
}

/** Polished table skeleton */
function TableSkeleton({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3.5 bg-muted/50 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <S
            key={i}
            className={cn(
              "h-4 rounded",
              i === 0 ? "w-36 flex-shrink-0" : "w-20 flex-1",
              i === cols - 1 && "w-12 flex-none ml-auto"
            )}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 px-6 py-4 border-b border-border/50 last:border-0"
        >
          {r < 3 && (
            <S className="w-10 h-10 rounded-full flex-shrink-0" />
          )}
          {Array.from({ length: cols }).map((_, c) => (
            <S
              key={c}
              className={cn(
                "h-4 rounded",
                c === 0 && r >= 3 ? "w-36 flex-shrink-0" : c === 0 ? "w-28" : "w-20 flex-1",
                c === cols - 1 && "w-12 flex-none ml-auto"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Simple table (no avatars) */
function SimpleTableSkeleton({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
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
function StatsRow({ count = 4 }: { count?: number }) {
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
function CardSkeleton({ lines = 3 }: { lines?: number }) {
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
function PaginationBar() {
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

// ============================================================================
// Page Skeletons
// ============================================================================

/** Tasks list page */
export function TasksPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <PageHeader titleW="w-48" controls={2} />
        {/* Status tabs */}
        <div className="flex gap-2 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <S key={i} className={cn("h-9 rounded-full", i === 0 ? "w-24" : "w-20")} />
          ))}
        </div>
        <SummaryLine />
        {/* Task cards */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <S className="h-6 w-20 rounded-full" />
                    <S className="h-5 w-16 rounded-full" />
                    <S className="h-5 w-56 rounded" />
                  </div>
                  <S className="h-4 w-96 rounded" />
                  <div className="flex items-center gap-4 mt-1">
                    <S className="h-3.5 w-24 rounded" />
                    <S className="h-3.5 w-32 rounded" />
                    <S className="h-3.5 w-20 rounded" />
                  </div>
                </div>
                <S className="h-9 w-24 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
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

/** Employees list page */
export function EmployeesPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <PageHeader titleW="w-44" controls={4} />
        <SummaryLine />
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-4 px-6 py-3.5 bg-muted/50 border-b border-border">
            <S className="h-4 w-32 rounded" />
            <S className="h-4 w-16 rounded flex-1" />
            <S className="h-4 w-20 rounded flex-1" />
            <S className="h-4 w-20 rounded flex-1" />
            <S className="h-4 w-14 rounded flex-1" />
            <S className="h-4 w-20 rounded flex-1" />
            <S className="h-4 w-16 rounded flex-1" />
            <S className="h-4 w-8 rounded" />
          </div>
          {/* Rows with avatar */}
          {Array.from({ length: 6 }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 px-6 py-4 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-3 w-60 flex-shrink-0">
                <S className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <S className="h-4 w-28 rounded" />
                  <S className="h-3 w-36 rounded" />
                </div>
              </div>
              <S className="h-5 w-16 rounded-full flex-1" />
              <S className="h-5 w-16 rounded-full flex-1" />
              <S className="h-4 w-20 rounded flex-1" />
              <S className="h-4 w-14 rounded flex-1" />
              <S className="h-4 w-12 rounded flex-1" />
              <S className="h-5 w-16 rounded-full flex-1" />
              <S className="h-8 w-8 rounded-lg" />
            </div>
          ))}
          <PaginationBar />
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

/** Availability page */
export function AvailabilityPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <div className="flex items-center gap-3 mb-8">
          <S className="h-9 w-9 rounded-lg" />
          <S className="h-9 w-52 rounded-lg" />
          <div className="ml-auto flex gap-3">
            <S className="h-11 w-11 rounded-xl" />
            <S className="h-11 w-32 rounded-xl" />
            <S className="h-11 w-11 rounded-xl" />
          </div>
        </div>
        {/* Calendar grid */}
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
      </div>
    </div>
  )
}

/** Members page */
export function MembersPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <PageHeader titleW="w-56" controls={2} />
        <SummaryLine />
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center gap-4 px-6 py-3.5 bg-muted/50 border-b border-border">
            <S className="h-4 w-32 rounded flex-shrink-0" />
            <S className="h-4 w-16 rounded flex-1" />
            <S className="h-4 w-20 rounded flex-1" />
            <S className="h-4 w-16 rounded flex-1" />
            <S className="h-4 w-20 rounded flex-1" />
            <S className="h-4 w-8 rounded" />
          </div>
          {Array.from({ length: 6 }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 px-6 py-4 border-b border-border/50 last:border-0">
              <div className="space-y-1.5 w-56 flex-shrink-0">
                <S className="h-4 w-32 rounded" />
                <S className="h-3 w-44 rounded" />
              </div>
              <S className="h-5 w-16 rounded-full flex-1" />
              <S className="h-5 w-12 rounded-full flex-1" />
              <S className="h-5 w-14 rounded-full flex-1" />
              <S className="h-4 w-20 rounded flex-1" />
              <S className="h-8 w-8 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Invitations page */
export function InvitationsPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <PageHeader titleW="w-40" controls={1} />
        <SummaryLine />
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SimpleTableSkeleton cols={7} rows={5} />
          <PaginationBar />
        </div>
      </div>
    </div>
  )
}

/** Join requests page */
export function JoinRequestsPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <PageHeader titleW="w-44" controls={1} hasAction={false} />
        <SummaryLine />
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SimpleTableSkeleton cols={6} rows={5} />
          <PaginationBar />
        </div>
      </div>
    </div>
  )
}

/** Settings page */
export function SettingsPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <div className="mb-8">
          <S className="h-9 w-36 rounded-lg" />
          <S className="h-4 w-56 rounded-lg mt-2" />
        </div>
        <div className="space-y-6">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </div>
  )
}

/** Profile page */
export function ProfilePageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <div className="mb-8">
          <S className="h-9 w-32 rounded-lg" />
          <S className="h-4 w-48 rounded-lg mt-2" />
        </div>
        <div className="space-y-6">
          {/* Profile info card */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <div className="flex items-center gap-4 mb-6">
              <S className="w-16 h-16 rounded-full" />
              <div className="space-y-2">
                <S className="h-6 w-40 rounded" />
                <S className="h-4 w-56 rounded" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <S className="h-4 w-16 rounded" />
                  <S className="h-4 w-32 rounded" />
                </div>
              ))}
            </div>
          </div>
          <CardSkeleton lines={3} />
        </div>
      </div>
    </div>
  )
}

/** Attendance page */
export function AttendancePageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <PageHeader titleW="w-40" controls={1} hasAction={false} />
        <TabStrip count={4} />
        <StatsRow count={4} />
        <SimpleTableSkeleton cols={6} rows={6} />
      </div>
    </div>
  )
}

/** Generic list page skeleton (invoices, payments, assets, etc.) */
export function GenericListPageSkeleton({ titleW = "w-40" }: { titleW?: string }) {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <PageHeader titleW={titleW} controls={1} hasAction={false} />
        <SummaryLine />
        <SimpleTableSkeleton cols={5} rows={6} />
      </div>
    </div>
  )
}

/** Schedule page */
export function SchedulePageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <PageHeader titleW="w-36" controls={2} hasAction={false} />
        <TabStrip count={3} />
        {/* Calendar grid */}
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
      </div>
    </div>
  )
}

/** Sprints page */
export function SprintsPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={PAGE_INNER}>
        <PageHeader titleW="w-32" controls={1} />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <S className={cn("h-5 rounded", i === 0 ? "w-32" : "w-40")} />
                <S className="h-5 w-20 rounded-full" />
              </div>
              <S className="h-2 w-full rounded-full" />
              <div className="flex gap-3">
                <S className="h-3.5 w-16 rounded" />
                <S className="h-3.5 w-20 rounded" />
                <S className="h-3.5 w-16 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Live map page */
