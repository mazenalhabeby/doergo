"use client"

import { useQuery } from "@tanstack/react-query"
import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import { useRouteAccess } from "@/hooks/use-route-access"

/**
 * Everything waiting for the member's decision — ONE query read by the top bar's inbox button and the
 * sidebar's Approvals row. Asked only for somebody who can decide a kind; it waits for the page's own first
 * load (never what the first paint needs), and the socket events that add or settle a decision refresh it
 * (use-realtime-sync).
 */
export function useApprovalsCount(): { allowed: boolean; total: number; urgent: boolean } {
  const { may } = useRouteAccess()
  const allowed = may("/approvals")
  const afterFirstLoad = useAfterFirstLoad(1)
  const { data } = useQuery({
    queryKey: keys.approvals.count(),
    queryFn: approvalsApi.count,
    enabled: allowed && afterFirstLoad,
    staleTime: 30_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  })
  // Every badge counts what the member can act on now (`actionable`): an item half-way under an office rule that
  // waits for somebody else is not theirs to decide yet. An older server sends only `total`.
  return { allowed, total: data?.actionable ?? data?.total ?? 0, urgent: (data?.now ?? 0) > 0 }
}
