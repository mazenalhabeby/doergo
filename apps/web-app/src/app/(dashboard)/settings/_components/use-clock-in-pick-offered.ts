"use client"

import { useQuery } from "@tanstack/react-query"
import { offersClockInPick } from "@hbcfield/shared/client"
import { attendanceApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"

/**
 * The places this member may clock in at right now — the same read (and cache)
 * as the Clock in button — and whether "clock in where I stand / let me choose"
 * means anything for them: only with more than one.
 */
export function useClockInLocations(enabled = true) {
  return useQuery({
    queryKey: keys.attendance.myClockInLocations(),
    queryFn: () => attendanceApi.getClockInLocations(),
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function useClockInPickOffered(enabled = true): boolean {
  const { data } = useClockInLocations(enabled)
  return offersClockInPick(data?.length ?? 0)
}
