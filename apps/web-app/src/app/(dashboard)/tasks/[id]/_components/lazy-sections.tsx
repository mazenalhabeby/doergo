"use client"

import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"

/*
  The detail page's sections, loaded when they are needed, not with the page.

  The dialogs (task-detail-dialogs.tsx) open on a click (or a refused move); the service report exists
  only on a finished job and the route only where a route is recorded. Pulled in
  through the page they made it the heaviest route in the app (~485 kB first
  load); each now arrives as its own chunk the moment it is about to show.
  Sections that draw in the page keep a sized placeholder, so nothing jumps.
*/
export const ServiceReportSection = dynamic(
  () => import("./service-report-section").then((m) => m.ServiceReportSection),
  {
    ssr: false,
    loading: () => <SectionPlaceholder rows={4} />,
  },
)

export const RouteTrackingSection = dynamic(
  () => import("./route-tracking-section").then((m) => m.RouteTrackingSection),
  {
    ssr: false,
    loading: () => <SectionPlaceholder rows={6} />,
  },
)

/*
  The sections below the cards. Each sits in a CollapsibleSection whose header
  is drawn at once (and whose body mounts only when open), so only the body
  waits for its code, holding a placeholder. The two that hide themselves when
  empty (custom fields, step reports) hold nothing.
*/
export const SubtasksSection = dynamic(() => import("./subtasks-section").then((m) => m.SubtasksSection), {
  ssr: false,
  loading: () => <SectionPlaceholder rows={3} />,
})

export const ChecklistSection = dynamic(() => import("./checklist-section").then((m) => m.ChecklistSection), {
  ssr: false,
  loading: () => <SectionPlaceholder rows={3} />,
})

export const AttachmentsSection = dynamic(() => import("./attachments-section").then((m) => m.AttachmentsSection), {
  ssr: false,
  loading: () => <SectionPlaceholder rows={3} />,
})

export const DependenciesSection = dynamic(() => import("./dependencies-section").then((m) => m.DependenciesSection), {
  ssr: false,
  loading: () => <SectionPlaceholder rows={2} />,
})

export const ActivitySection = dynamic(() => import("./activity-section").then((m) => m.ActivitySection), {
  ssr: false,
  loading: () => <SectionPlaceholder rows={4} />,
})

export const CustomFieldsSection = dynamic(() => import("./custom-fields-section").then((m) => m.CustomFieldsSection), {
  ssr: false,
})

export const StepReportsSection = dynamic(
  () => import("@/components/step-forms/step-reports-section").then((m) => m.StepReportsSection),
  { ssr: false },
)

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
