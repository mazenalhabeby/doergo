"use client"

import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"

/** TaskDetailPage's module-level helpers, moved here unchanged so its sections can read them too. */
/*
  Loaded when they are needed, not with the page.

  The dialogs open on a click (or a refused move); the service report exists
  only on a finished job and the route only where a route is recorded. Pulled in
  through the page they made it the heaviest route in the app (~485 kB first
  load); each now arrives as its own chunk the moment it is about to show.
  Sections that draw in the page keep a sized placeholder, so nothing jumps.
*/
export const EditTaskDialog = dynamic(() => import("./_components/edit-task-dialog").then((m) => m.EditTaskDialog), { ssr: false })

export const AssignMemberDialog = dynamic(
  () => import("@/components/assign-member-dialog").then((m) => m.AssignMemberDialog),
  { ssr: false })

export const ClockGateDialog = dynamic(() => import("@/components/clock-gate-dialog").then((m) => m.ClockGateDialog), { ssr: false })

export const OfficeStartDialog = dynamic(() => import("@/components/office-start-dialog").then((m) => m.OfficeStartDialog), { ssr: false })

export const ServiceReportSection = dynamic(() => import("./_components/service-report-section").then((m) => m.ServiceReportSection), {
  ssr: false,
  loading: () => <SectionPlaceholder rows={4} />,
})

export const RouteTrackingSection = dynamic(() => import("./_components/route-tracking-section").then((m) => m.RouteTrackingSection), {
  ssr: false,
  loading: () => <SectionPlaceholder rows={6} />,
})

/*
  The sections below the cards. Each sits in a CollapsibleSection whose header
  is drawn at once (and whose body mounts only when open), so only the body
  waits for its code, holding a placeholder. The two that hide themselves when
  empty (custom fields, step reports) hold nothing.
*/
export const SubtasksSection = dynamic(
  () => import("./_components/subtasks-section").then((m) => m.SubtasksSection),
  { ssr: false, loading: () => <SectionPlaceholder rows={3} /> })

export const ChecklistSection = dynamic(
  () => import("./_components/checklist-section").then((m) => m.ChecklistSection),
  { ssr: false, loading: () => <SectionPlaceholder rows={3} /> })

export const AttachmentsSection = dynamic(
  () => import("./_components/attachments-section").then((m) => m.AttachmentsSection),
  { ssr: false, loading: () => <SectionPlaceholder rows={3} /> })

export const DependenciesSection = dynamic(
  () => import("./_components/dependencies-section").then((m) => m.DependenciesSection),
  { ssr: false, loading: () => <SectionPlaceholder rows={2} /> })

export const ActivitySection = dynamic(
  () => import("./_components/activity-section").then((m) => m.ActivitySection),
  { ssr: false, loading: () => <SectionPlaceholder rows={4} /> })

export const CustomFieldsSection = dynamic(
  () => import("./_components/custom-fields-section").then((m) => m.CustomFieldsSection),
  { ssr: false })

export const StepReportsSection = dynamic(
  () => import("@/components/step-forms/step-reports-section").then((m) => m.StepReportsSection),
  { ssr: false })

/** The shape a lazily loaded section holds while its code arrives. */
function SectionPlaceholder({ rows }: { rows: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  )
}
