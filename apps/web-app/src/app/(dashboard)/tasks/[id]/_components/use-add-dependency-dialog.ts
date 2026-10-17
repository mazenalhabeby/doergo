"use client"

import { keys } from "@/lib/query-keys"
import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { tasksApi, type Task, type WorkflowStatus } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useRelatedStepConfigs } from "@/hooks/use-step-config"

/** AddDependencyDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useAddDependencyDialog({
  open,
  onOpenChange,
  taskId,
  existingDepIds,
  workflowStatuses,
}: Pick<{
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  existingDepIds: Set<string>
  workflowStatuses?: readonly WorkflowStatus[] | null
}, 'open' | 'onOpenChange' | 'taskId' | 'existingDepIds' | 'workflowStatuses'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 300)
  const [depType, setDepType] = useState("FINISH_TO_START")

  // Search tasks
  const { data: searchResults, isLoading: searching } = useQuery({
    // Asked of the server once the typing settles: the list below still
    // narrows on every keystroke, but a request per letter is wasted.
    queryKey: keys.taskExtras.search(debouncedSearch),
    queryFn: () => tasksApi.list({ limit: 20, search: debouncedSearch || undefined }),
    enabled: open,
    staleTime: 10000,
  })

  const filteredResults = useMemo(() => {
    const tasks = searchResults?.data || []
    return tasks.filter((t: Task) => {
      if (t.id === taskId) return false
      if (existingDepIds.has(t.id)) return false
      if (!search) return true
      return t.title.toLowerCase().includes(search.toLowerCase())
    })
  }, [searchResults, search, taskId, existingDepIds])
  const stepOf = useRelatedStepConfigs(filteredResults, workflowStatuses)

  const addMutation = useMutation({
    mutationFn: (predecessorId: string) =>
      tasksApi.addDependency(taskId, predecessorId, depType),
    onSuccess: () => {
      notify.success(t("tasks.dependencies.added"))
      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(taskId) })
      onOpenChange(false)
      setSearch("")
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return {
    t,
    search,
    setSearch,
    depType,
    setDepType,
    searching,
    filteredResults,
    stepOf,
    addMutation,
  }
}

/** What AddDependencyDialog and its sections read. */
export type AddDependencyDialogState = ReturnType<typeof useAddDependencyDialog>
