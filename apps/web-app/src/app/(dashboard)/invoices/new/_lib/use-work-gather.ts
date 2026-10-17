"use client"

import { useQuery } from "@tanstack/react-query"

import { keys } from "@/lib/query-keys"
import { invoicesApi } from "@/lib/api"
import { periodDays, periodQuery, type PeriodValue } from "@/components/ui/period-picker"

/**
 * The completed, unbilled work for the chosen source and period — and every
 * outstanding day regardless of the period, for the calendar.
 */
export function useWorkGather({
  source,
  spaceId,
  customerId,
  periodValue,
}: {
  source: "space" | "client" | "none"
  spaceId: string | undefined
  customerId: string
  periodValue: PeriodValue
}) {
  // Completed, unbilled work — from whichever end was chosen, over whichever
  // days were named. Both ends are optional: blank means everything still
  // outstanding, which is right for a one-off job.
  const period = periodQuery(periodValue)

  const gatherSource =
    source === "space" && spaceId
      ? { spaceId, ...period }
      : source === "client" && customerId
        ? { customerId, ...period }
        : null
  /*
    ⚠️ ALWAYS FRESH. What is still to bill moves whenever a rate, a role, a
    clock-in or another invoice changes — often in another tab a moment ago.
    Read on every visit and on returning to the window, never from a cache.
  */
  const { data: gather, isLoading: gatherLoading } = useQuery({
    queryKey: keys.invoices.gather(gatherSource),
    queryFn: () => invoicesApi.gather(gatherSource!),
    enabled: !!gatherSource,
    staleTime: 0,
    refetchOnWindowFocus: true,
    /*
      Keep the lines on screen while another period loads — but only for the
      SAME workspace or client, never another one's lines under a new name.
    */
    placeholderData: (prev, prevQuery) => {
      const was = prevQuery?.queryKey[1] as { spaceId?: string; customerId?: string } | null | undefined
      // Either a workspace or a client source: the other id is simply absent.
      const now: { spaceId?: string; customerId?: string } | null = gatherSource
      return was && now && was.spaceId === now.spaceId && was.customerId === now.customerId ? prev : undefined
    },
  })
  /*
    Every unbilled day, whatever period is chosen: marks the calendar and says
    when older work is still waiting before the chosen dates — without it, an
    unbilled month would never reach any invoice and nothing would say so.
  */
  const allSource = gatherSource ? { ...gatherSource, from: undefined, to: undefined } : null
  const { data: allGather } = useQuery({
    queryKey: keys.invoices.gather(allSource),
    queryFn: () => invoicesApi.gather(allSource!),
    enabled: !!allSource,
    staleTime: 60_000,
  })
  const workDays: string[] | undefined = allGather?.outstandingDays
  // The days this invoice covers — shown, sent and stored as the same two dates.
  const { from: periodFrom, to: periodTo } = periodDays(periodValue)

  return { gatherSource, gather, gatherLoading, workDays, periodFrom, periodTo }
}
