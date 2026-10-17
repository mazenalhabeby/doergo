"use client"

import { keys } from "@/lib/query-keys"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { customersApi } from "@/lib/api"

interface ClientAddressOption {
  /** "client" = the address on the client record itself; otherwise an address row id. */
  id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  isPrimary: boolean
}

/**
 * Everywhere a client's address might be — for a job's visit and a calendar appointment alike.
 *
 * ⚠️ Reading only the address ROWS was wrong, and the live data says so plainly: of thirteen
 * clients, eight carry an address on the client record and none of those has a row. Offering rows
 * alone would show an empty picker for exactly the clients that have an address.
 *
 * The client's own address comes first because it is the one most records have; the rows follow,
 * primary first. Both reads are reach-gated on the server, so a client the caller cannot see
 * yields nothing.
 *
 * `known` is the client when the caller already has its record (from a list), so it is not read again.
 */
export function useClientAddresses(
  customerId: string | null,
  opts: { enabled: boolean; known?: { id: string; name: string; address?: string | null } | null }) {
  const id = customerId && customerId !== "none" ? customerId : null
  const { data: pinned } = useQuery({
    queryKey: keys.customers.detail(id),
    queryFn: () => customersApi.get(id!),
    staleTime: 60000,
    enabled: opts.enabled && !!id && !opts.known,
  })
  const { data: rows = [] } = useQuery({
    queryKey: keys.customers.addresses(id),
    queryFn: () => customersApi.addresses(id!),
    staleTime: 60000,
    enabled: opts.enabled && !!id,
  })
  const options = useMemo(() => {
    if (!id) return [] as ClientAddressOption[]
    const chosen = opts.known ?? pinned
    const out: ClientAddressOption[] = []
    const own = chosen?.address ?? null
    if (own) out.push({ id: "client", name: own, address: own, lat: null, lng: null, isPrimary: false })
    for (const a of rows) {
      out.push({
        id: a.id,
        name: a.name || a.address || "",
        address: a.address ?? null,
        lat: a.lat ?? null,
        lng: a.lng ?? null,
        isPrimary: a.isPrimary
      })
    }
    return out
  }, [id, opts.known, pinned, rows])
  return { options, client: opts.known ?? pinned ?? null }
}
