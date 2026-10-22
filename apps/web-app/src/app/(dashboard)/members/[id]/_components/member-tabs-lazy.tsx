"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"

/*
  The member page's tabs other than the one it opens on, each in its own chunk.
  Only the open tab renders (Radix unmounts the others), so loading them all with
  the page made every visit pay for five tabs it might never show. The chunks are
  WARMED right after the first paint (useWarmMemberTabs), so switching to a tab
  normally finds its code already loaded and shows no loading state.
*/
const loaders = {
  statement: () => import("./statement-tab").then((m) => m.StatementTab),
  attendance: () => import("./attendance-tab").then((m) => m.AttendanceTab),
  locations: () => import("./locations-tab").then((m) => m.LocationsTab),
  schedule: () => import("./schedule-tab").then((m) => m.ScheduleTab),
  holdings: () => import("./holdings-tab").then((m) => m.HoldingsTab),
}

const loading = () => <Skeleton className="h-48 w-full rounded-xl" />

export const StatementTab = dynamic(loaders.statement, { loading })
export const AttendanceTab = dynamic(loaders.attendance, { loading })
export const LocationsTab = dynamic(loaders.locations, { loading })
export const ScheduleTab = dynamic(loaders.schedule, { loading })
export const HoldingsTab = dynamic(loaders.holdings, { loading })

/** Fetch every tab's code once the page's own first reads are done. */
export function useWarmMemberTabs(): void {
  const ready = useAfterFirstLoad(1)
  useEffect(() => {
    if (!ready) return
    for (const load of Object.values(loaders)) void load()
  }, [ready])
}

// Performance tab pulls in recharts — load it as its own chunk only when the tab
// is opened, so every other visitor doesn't pay for the chart lib (P11).
export const PerformanceTab = dynamic(() => import("./performance-tab").then((m) => m.PerformanceTab), { ssr: false })

// Same reasoning for the rest of the weight (audit MD-C1). The page opens on
// Overview, which renders none of these — the Access builder, the edit dialog, the
// audit trail and the Time Off tab were ~1,600 lines paid for on every visit.
export const AccessBuilder = dynamic(
  () => import("@/components/permissions/access-builder").then((m) => m.AccessBuilder),
  { ssr: false },
)

export const EditMemberDialog = dynamic(
  () => import("../../_components/edit-member-dialog").then((m) => m.EditMemberDialog),
  { ssr: false },
)

export const AuditTrail = dynamic(() => import("@/components/common/audit-trail").then((m) => m.AuditTrail), {
  ssr: false,
})

export const TimeOffTab = dynamic(() => import("./time-off-tab").then((m) => m.TimeOffTab), { ssr: false })
