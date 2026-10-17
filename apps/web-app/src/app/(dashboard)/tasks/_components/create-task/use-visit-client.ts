"use client"

import { useCallback, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { keys } from "@/lib/query-keys"
import { customersApi } from "@/lib/api"
import { geocodeAddress } from "@/lib/geocode"
import { useClientAddresses } from "@/hooks/use-client-addresses"

/**
 * A visit: which client, which of their addresses, and copying that address
 * (and its point) onto the task's location. State lives in the form hook; this
 * owns the client list and the address choice.
 */
export function useVisitClient({
  open,
  spaceId,
  hasModule,
  defaultCustomerId,
  customerId,
  visitAddressId,
  setVisitAddressId,
  setLocationAddress,
  setLocationLat,
  setLocationLng,
}: {
  open: boolean
  spaceId: string
  hasModule: (module: string) => boolean
  defaultCustomerId?: string | null
  customerId: string
  visitAddressId: string
  setVisitAddressId: (id: string) => void
  setLocationAddress: (address: string) => void
  setLocationLat: (lat: number | null) => void
  setLocationLng: (lng: number | null) => void
}) {
  /*
    The clients this person may raise a visit for.

    Scoped to the SELECTED WORKSPACE — the smaller query, and the right answer:
    a visit is raised in the workspace the work belongs to.

    ⚠️ Plus the clients filed in NO workspace, and that is not a nicety. Scoping
    strictly looked correct and was useless on real data: of thirteen clients,
    nine belong to no workspace — including every single one that has an
    address. A picker that omits them offers four clients nobody can be sent to
    and hides the nine you would actually visit.

    One query, one indexed OR, done on the server: fetching the whole book and
    dropping rows in the browser would page-truncate before it filtered.

    Two gates, and both are the point. No workspace chosen, or a workspace
    without the CRM module, and this never runs — the task is a plain one with
    a location typed by hand, exactly as before.

    Nothing is filtered in the browser: `GET /customers` already answers in the
    caller's CRM scope, so a Sales Rep is offered the clients they own and an
    admin all of them. A second copy of that rule here would be one to keep in
    step, and the browser's copy is the one that cannot be trusted anyway.
  */
  const { data: clientPage } = useQuery({
    queryKey: keys.customers.list({ spaceId, includeUnfiled: true, limit: 200 }),
    queryFn: () => customersApi.list({ spaceId, includeUnfiled: true, limit: 200 }),
    staleTime: 60000,
    enabled: open && spaceId !== "none" && hasModule("crm") && !defaultCustomerId,
  })
  const visitClients = clientPage?.data ?? []

  // Where that client is: the record's own address, then its address rows (shared with the calendar).
  const listedClient = visitClients.find((c) => c.id === customerId) ?? null
  const { options: visitAddressOptions, client: chosenClient } = useClientAddresses(customerId, { enabled: open, known: listedClient })
  // Opened from a client's page the list is never fetched — that client is shown from its own record.
  const pinnedClient = listedClient ? null : chosenClient

  /*
    Put the client's address on the task, and find its point.

    One place does it, called both by the picker and by the automatic choice
    below, so "chosen by hand" and "chosen for you" can never fill different
    fields.

    An address with no coordinates is a destination nobody can navigate to and
    a route nothing can measure — which is most of them, since a typed address
    on a client record has never been near a map. So a text-only address is
    geocoded once, rather than left for somebody to re-find by hand on the map
    they are already looking at. Failure is not an error: the text still names
    the place, the pin stays empty, and the note below says so.
  */
  const applyVisitAddress = useCallback(async (
    opt: { address: string | null; name: string; id: string; lat: number | null; lng: number | null } | null) => {
    setVisitAddressId(opt?.id ?? "none")
    if (!opt) return
    const text = opt.address ?? opt.name ?? ""
    setLocationAddress(text)
    setLocationLat(opt.lat ?? null)
    setLocationLng(opt.lng ?? null)
    if (opt.lat != null || !text.trim()) return

    const point = await geocodeAddress(text)
    if (point) { setLocationLat(point.lat); setLocationLng(point.lng) }
    // The setters are useState setters from the form hook — stable, so this is still created once.
  }, [setVisitAddressId, setLocationAddress, setLocationLat, setLocationLng])

  /*
    Choosing a client is choosing a destination when there is only one it could
    be — their primary site, or their only address. Anything beyond that is a
    guess, so the picker below stays and simply waits.
  */
  useEffect(() => {
    if (!open || customerId === "none" || visitAddressOptions.length === 0) return
    if (visitAddressId !== "none") return
    const pick = visitAddressOptions.find((a) => a.isPrimary)
      ?? (visitAddressOptions.length === 1 ? visitAddressOptions[0] : null)
    if (pick) void applyVisitAddress(pick)
  }, [open, customerId, visitAddressOptions, visitAddressId, applyVisitAddress])

  return { visitClients, visitAddressOptions, pinnedClient, applyVisitAddress }
}
