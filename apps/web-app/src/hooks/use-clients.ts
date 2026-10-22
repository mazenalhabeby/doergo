"use client"

import { useQuery } from "@tanstack/react-query"
import { customersApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"

/** How long a client list is fresh. Client writes invalidate `keys.customers.lists()`. */
export const CLIENTS_STALE_MS = 60_000

export type ClientListParams = NonNullable<Parameters<typeof customersApi.list>[0]>

/**
 * One page of the organization's clients for these filters. ONE hook, so the key always matches
 * the request and every list shares one refresh time.
 */
export function useClients(params: ClientListParams, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.customers.list(params),
    queryFn: () => customersApi.list(params),
    staleTime: CLIENTS_STALE_MS,
    enabled,
  })
}
