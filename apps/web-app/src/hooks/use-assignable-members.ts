"use client"

import { keys } from "@/lib/query-keys"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { locationsApi, organizationsApi } from "@/lib/api"
import {
  mayListOrgMembers,
  memberSourceFor,
  peopleFromRosters,
  personFromMember,
  type AssignablePerson,
  type MemberSource,
} from "@/lib/assignable-members"

const NONE: AssignablePerson[] = []

/**
 * The people a picker may offer — see `lib/assignable-members.ts` for the rule.
 *
 * `spaceMemberIds` is the workspace's roster when a space is given (also for a
 * directory reader, so a dialog can put the site's people first).
 */
export function useAssignableMembers(opts: { spaceId?: string | null; enabled?: boolean; rosterOnly?: boolean }) {
  const { user } = useAuth()
  const enabled = opts.enabled !== false && !!user
  const spaceId = opts.spaceId || null
  const mayListOrg = mayListOrgMembers(user)
  const source: MemberSource = memberSourceFor({ mayListOrg, spaceId, rosterOnly: opts.rosterOnly })

  const directory = useQuery({
    // The whole directory, every page — one key for every picker.
    queryKey: keys.members.directory(),
    queryFn: () => organizationsApi.getAllMembers(),
    enabled: enabled && source === "directory",
    staleTime: 30_000,
  })

  const roster = useQuery({
    queryKey: keys.locations.roster(spaceId),
    queryFn: () => locationsApi.getAssignedMembers(spaceId!),
    enabled: enabled && !!spaceId,
    staleTime: 30_000,
  })

  const visible = useQuery({
    queryKey: keys.spaces.visibleRosters(),
    queryFn: async () => {
      const spaces = await locationsApi.list({ limit: 200 })
      const ids = (spaces?.data ?? []).map((s) => s.id).filter(Boolean)
      return locationsApi.getRosters(ids)
    },
    enabled: enabled && source === "visible-spaces",
    staleTime: 60_000,
  })

  const members = useMemo<AssignablePerson[]>(() => {
    if (source === "directory") return (directory.data ?? []).map(personFromMember)
    if (source === "space") return peopleFromRosters(roster.data)
    return visible.data ? peopleFromRosters(visible.data) : NONE
  }, [source, directory.data, roster.data, visible.data])

  const spaceMemberIds = useMemo(
    () => new Set((roster.data ?? []).map((a) => a.userId)),
    [roster.data],
  )

  const isLoading =
    (source === "directory" && directory.isLoading) ||
    (!!spaceId && roster.isLoading) ||
    (source === "visible-spaces" && visible.isLoading)

  return { members, spaceMemberIds, isLoading: enabled && isLoading, source }
}
