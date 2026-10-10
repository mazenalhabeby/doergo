"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { keys } from "@/lib/query-keys"
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import {
  organizationsApi,
  locationsApi,
  rateHistoryApi,
  type OrgMember,
  type LocationAssignment,
} from "@/lib/api"

/** A location assignment with the space's name folded in for display. */
export type NamedAssignment = LocationAssignment & { locationName: string }

/**
 * The editor's reads (self-contained; shared query keys dedupe across pages):
 * the member's cost-rate history, the positions used in the organization, the
 * spaces and every space's roster.
 */
export function useMemberEditorData(member: OrgMember | null, canViewLabourCost: boolean) {
  // ── Data (self-contained; shared query keys dedupe across pages) ──
  // The member's own cost rate and its history — only for people who may see cost.
  const { data: memberRates } = useQuery({
    queryKey: keys.rates.history("MEMBER", member?.id),
    queryFn: () => rateHistoryApi.list({ target: "MEMBER", targetId: member!.id }),
    enabled: !!member?.id && canViewLabourCost,
  })
  const { data: membersData } = useQuery({
    queryKey: keys.members.directory(),
    queryFn: () => organizationsApi.getAllMembers(),
    enabled: !!member,
    staleTime: 60000,
  })
  const usedPositions = useMemo(() => {
    const set = new Set<string>()
    for (const m of membersData ?? []) if (m.position) set.add(m.position)
    return Array.from(set).sort()
  }, [membersData])


  // The shared workspace directory (lib/space-directory), active ones.
  const { data: directory } = useSpaceDirectory({ enabled: !!member })
  const locations = useMemo(() => (directory ?? []).filter((l) => l.isActive !== false), [directory])

  // ONE batched read of every space's roster, under the same key the members
  // page reads it with (it was a request per space, keyed by how many there were).
  const locationIds = useMemo(() => locations.map((l) => l.id).sort(), [locations])
  const { data: rosterRows } = useQuery({
    queryKey: keys.locations.rosterBatch(locationIds),
    queryFn: () => locationsApi.getRosters(locationIds),
    enabled: !!member && locationIds.length > 0,
    staleTime: 60000,
  })
  const allAssignments = useMemo<NamedAssignment[] | undefined>(() => {
    if (!rosterRows) return undefined
    const names = new Map(locations.map((l) => [l.id, l.name]))
    return rosterRows.map((a) => ({ ...a, locationName: names.get(a.locationId) ?? a.location?.name ?? "" }))
  }, [rosterRows, locations])

  return { memberRates, usedPositions, locations, allAssignments }
}
