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
  statement: () => import("./_components/statement-tab").then((m) => m.StatementTab),
  attendance: () => import("./_components/attendance-tab").then((m) => m.AttendanceTab),
  locations: () => import("./_components/locations-tab").then((m) => m.LocationsTab),
  schedule: () => import("./_components/schedule-tab").then((m) => m.ScheduleTab),
  holdings: () => import("./_components/holdings-tab").then((m) => m.HoldingsTab),
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
