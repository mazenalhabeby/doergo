import { Shimmer as S } from "./primitives";
import { cn } from "@/lib/utils";
import { PAGE_WIDTH } from "@/components/ui/page-width";
import {
  PAGE_OUTER,
  PAGE_INNER,
  PageHeader,
  SummaryLine,
  TabStrip,
  SimpleTableSkeleton,
  StatsRow,
  CardSkeleton,
  PaginationBar,
  CalendarGridSkeleton,
} from "./employee-detail-page-skeleton";

/** Availability page */
export function AvailabilityPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      <div className={`${PAGE_WIDTH} py-6`}>
        <div className="flex items-center gap-3 mb-8">
          <S className="h-9 w-9 rounded-lg" />
          <S className="h-9 w-52 rounded-lg" />
          <div className="ml-auto flex gap-3">
            <S className="h-11 w-11 rounded-xl" />
            <S className="h-11 w-32 rounded-xl" />
            <S className="h-11 w-11 rounded-xl" />
          </div>
        </div>
        <CalendarGridSkeleton />
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
        <CalendarGridSkeleton />
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
