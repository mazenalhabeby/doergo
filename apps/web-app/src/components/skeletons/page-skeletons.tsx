import { Shimmer as S } from './primitives';
import { cn } from "@/lib/utils"
import { PAGE_WIDTH } from "@/components/ui/page-width"
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
export {
  AvailabilityPageSkeleton,
  MembersPageSkeleton,
  InvitationsPageSkeleton,
  JoinRequestsPageSkeleton,
  SettingsPageSkeleton,
  ProfilePageSkeleton,
  AttendancePageSkeleton,
  GenericListPageSkeleton,
  SchedulePageSkeleton,
  SprintsPageSkeleton,
} from "./members-page-skeleton";
export {
  TaskDetailPageSkeleton,
  TaskNewPageSkeleton,
  EmployeeDetailPageSkeleton,
  EmployeeNewPageSkeleton,
} from "./employee-detail-page-skeleton";

// ============================================================================
// Base Shimmer Block
// ============================================================================

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

/** Live map page */
