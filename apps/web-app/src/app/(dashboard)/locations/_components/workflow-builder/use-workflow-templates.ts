"use client"

import { keys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"

import { workflowsApi } from "@/lib/api"
import { draftFromStored } from "@/lib/step-forms"
import type { Template } from "./types"

/** The library's starter flows, shaped as templates this builder can apply. */
export function useWorkflowTemplates(): Template[] {
  // Published starter flows, shared across every organization. Cheap and
  // rarely changes, so it is cached rather than refetched per open.
  const { data: library = [] } = useQuery({
    queryKey: keys.spaces.workflowLibrary(),
    queryFn: workflowsApi.library.list,
    staleTime: 5 * 60_000,
  })
  return library.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    statuses: [...tpl.statuses]
      .sort((a, b) => a.position - b.position)
      .map((st) => ({
        name: st.name,
        nameKey: st.nameKey ?? null,
        color: st.color,
        isFinal: st.isFinal,
        isCanceled: st.isCanceled,
        capabilities: st.capabilities ?? [],
        form: draftFromStored(st.form),
      })),
  }))
}
