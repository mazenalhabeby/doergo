"use client"

import { keys } from "@/lib/query-keys"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { phasesApi, sprintsApi, epicsApi, customFieldsApi } from "@/lib/api"

/** What the New Task dialog lists: active custom fields, phases, sprints and epics. */
export function useCreateTaskLists(open: boolean) {
  // ── Fetch custom fields ──
  const { data: customFields } = useQuery({
    queryKey: keys.customFields.definitions(),
    queryFn: () => customFieldsApi.listDefinitions(),
    staleTime: 120000,
    retry: 1,
    enabled: open,
  })
  const activeCustomFields = useMemo(() => (customFields || []).filter((f) => f.isActive), [customFields])

  // ── Fetch phases and sprints ──
  const { data: phases } = useQuery({
    queryKey: keys.phases.lists(),
    queryFn: () => phasesApi.list(),
    staleTime: 60000,
    enabled: open,
  })

  const { data: sprints } = useQuery({
    queryKey: keys.sprints.lists(),
    queryFn: () => sprintsApi.list(),
    staleTime: 60000,
    enabled: open,
  })

  // ── Fetch epics ──
  const { data: fetchedEpics } = useQuery({
    queryKey: keys.epics.lists(),
    queryFn: () => epicsApi.list(),
    staleTime: 60000,
    enabled: open,
  })

  return { activeCustomFields, phases, sprints, fetchedEpics }
}
