"use client"

import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, Loader2 } from "lucide-react"
import { keys } from "@/lib/query-keys"
import { tasksApi, type Task, type WorkflowStatus } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useRelatedStepConfigs } from "@/hooks/use-step-config"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DEP_TYPE_LABELS, DEP_TYPE_KEYS } from "./dependency-types"

interface AddDependencyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  existingDepIds: Set<string>
  workflowStatuses?: readonly WorkflowStatus[] | null
}

/** Pick a task this one waits for, and how it waits (finish-to-start, …). */
export function AddDependencyDialog({
  open,
  onOpenChange,
  taskId,
  existingDepIds,
  workflowStatuses,
}: AddDependencyDialogProps) {
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
    mutationFn: (predecessorId: string) => tasksApi.addDependency(taskId, predecessorId, depType),
    onSuccess: () => {
      notify.success(t("tasks.dependencies.added"))
      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(taskId) })
      onOpenChange(false)
      setSearch("")
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tasks.dependencies.add")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dependency type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("tasks.dependencies.type")}</label>
            <Select value={depType} onValueChange={setDepType}>
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DEP_TYPE_KEYS).map(([val, labelKey]) => (
                  <SelectItem key={val} value={val}>
                    {t(labelKey)} ({DEP_TYPE_LABELS[val]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("tasks.dependencies.searchTasks")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 rounded-lg"
              autoFocus
            />
          </div>

          {/* Results */}
          <div className="max-h-[240px] overflow-y-auto rounded-lg border border-border/50">
            {filteredResults.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {searching ? t("common.searching") : t("tasks.dependencies.noMatchingTasks")}
              </div>
            )}
            {filteredResults.map((task: Task) => {
              const step = stepOf(task)
              return (
                <button
                  key={task.id}
                  onClick={() => addMutation.mutate(task.id)}
                  disabled={addMutation.isPending}
                  className={
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 " +
                    "transition-colors border-b border-border/30 last:border-b-0"
                  }
                >
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: step.hex }}
                    title={step.label}
                  />
                  <span className="text-sm font-medium text-foreground truncate flex-1">{task.title}</span>
                  {addMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Plus className="size-3.5 text-muted-foreground" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
