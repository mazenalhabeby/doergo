"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { teamApi, organizationsApi } from "@/lib/api"
import type { Colleague } from "@/lib/api/types/team"
import { keys } from "@/lib/query-keys"

export type PresenceFilter = "all" | "AVAILABLE" | "BUSY" | "AWAY"
export const presenceOf = (p?: string | null): Exclude<PresenceFilter, "all"> =>
  p === "AVAILABLE" || p === "BUSY" ? p : "AWAY"

/**
 * Who the caller sees on Team: the managers they may contact, then the
 * colleagues in their workspaces — the same two lists the phone's Team tab
 * reads, each row saying whether the caller may message them.
 */
export function usePeople(enabled = true) {
  const team = useQuery({ queryKey: keys.people.team(), queryFn: () => teamApi.list(), staleTime: 60_000, enabled })
  const contacts = useQuery({
    queryKey: keys.people.contacts(),
    queryFn: () => organizationsApi.getContacts(),
    staleTime: 60_000,
    enabled,
  })
  return useMemo(() => {
    const managers = (contacts.data ?? []) as unknown as Colleague[]
    const ids = new Set(managers.map((m) => m.id))
    const colleagues = (team.data ?? []).filter((c) => !ids.has(c.id))
    return { managers, colleagues, all: [...managers, ...colleagues], loading: team.isLoading || contacts.isLoading }
  }, [team.data, contacts.data, team.isLoading, contacts.isLoading])
}

/** Search by name, job or workspace, and keep one presence. */
export function filterPeople(list: Colleague[], query: string, presence: PresenceFilter): Colleague[] {
  const q = query.trim().toLowerCase()
  return list.filter(
    (p) =>
      (presence === "all" || presenceOf(p.presence) === presence) &&
      (!q || `${p.firstName} ${p.lastName} ${p.position ?? ""} ${p.spaceName ?? ""}`.toLowerCase().includes(q)),
  )
}
