"use client"

import { useState, memo, useMemo } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  X,
  Search,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react"

import { tasksApi, type Task, type TaskDependency } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_DOTS: Record<string, string> = {
  DRAFT: "bg-slate-400",
  NEW: "bg-blue-500",
  ASSIGNED: "bg-purple-500",
  ACCEPTED: "bg-purple-400",
  EN_ROUTE: "bg-amber-500",
  ARRIVED: "bg-amber-400",
  IN_PROGRESS: "bg-amber-500",
  BLOCKED: "bg-red-500",
  COMPLETED: "bg-green-500",
  CLOSED: "bg-slate-400",
  CANCELED: "bg-slate-300",
}

const DEP_TYPE_LABELS: Record<string, string> = {
  FINISH_TO_START: "FS",
  START_TO_START: "SS",
  FINISH_TO_FINISH: "FF",
  START_TO_FINISH: "SF",
}

const DEP_TYPE_KEYS: Record<string, string> = {
  FINISH_TO_START: "tasks.dependencies.types.FINISH_TO_START",
  START_TO_START: "tasks.dependencies.types.START_TO_START",
  FINISH_TO_FINISH: "tasks.dependencies.types.FINISH_TO_FINISH",
  START_TO_FINISH: "tasks.dependencies.types.START_TO_FINISH",
}

// ---------------------------------------------------------------------------
// DependencyRow
// ---------------------------------------------------------------------------
const DependencyRow = memo(function DependencyRow({
  dep,
  taskId,
  direction,
  onRemove,
  isRemoving,
}: {
  dep: TaskDependency
  taskId: string
  direction: "predecessor" | "successor"
  onRemove: (depId: string) => void
  isRemoving: boolean
}) {
  const linked =
    direction === "predecessor" ? dep.predecessor : dep.successor
  if (!linked) return null

  const dotClass = STATUS_DOTS[linked.status] || "bg-slate-400"

  return (
    <div className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/40 transition-colors rounded-lg">
      <span className={cn("size-2 rounded-full shrink-0", dotClass)} />
      <Link
        href={`/tasks/${linked.id}`}
        className="text-sm font-medium text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-1 truncate"
      >
        {linked.title}
      </Link>
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
        {DEP_TYPE_LABELS[dep.type] || dep.type}
      </span>
      {dep.lagDays !== 0 && (
        <span className="text-[10px] text-muted-foreground shrink-0">
          {dep.lagDays > 0 ? `+${dep.lagDays}d` : `${dep.lagDays}d`}
        </span>
      )}
      <button
        onClick={() => onRemove(dep.id)}
        disabled={isRemoving}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-all shrink-0"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
})

// ---------------------------------------------------------------------------
// AddDependencyDialog
// ---------------------------------------------------------------------------
function AddDependencyDialog({
  open,
  onOpenChange,
  taskId,
  existingDepIds,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  existingDepIds: Set<string>
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [depType, setDepType] = useState("FINISH_TO_START")

  // Search tasks
  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ["taskSearch", search],
    queryFn: () => tasksApi.list({ limit: 20 }),
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

  const addMutation = useMutation({
    mutationFn: (predecessorId: string) =>
      tasksApi.addDependency(taskId, predecessorId, depType),
    onSuccess: () => {
      notify.success(t("tasks.dependencies.added"))
      queryClient.invalidateQueries({ queryKey: ["task", taskId] })
      onOpenChange(false)
      setSearch("")
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("tasks.dependencies.add")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dependency type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("tasks.dependencies.type")}
            </label>
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
              const dotClass = STATUS_DOTS[task.status] || "bg-slate-400"
              return (
                <button
                  key={task.id}
                  onClick={() => addMutation.mutate(task.id)}
                  disabled={addMutation.isPending}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border/30 last:border-b-0"
                >
                  <span className={cn("size-2 rounded-full shrink-0", dotClass)} />
                  <span className="text-sm font-medium text-foreground truncate flex-1">
                    {task.title}
                  </span>
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

// ---------------------------------------------------------------------------
// DependenciesSection
// ---------------------------------------------------------------------------
interface DependenciesSectionProps {
  taskId: string
  predecessors?: TaskDependency[]
  successors?: TaskDependency[]
}

export const DependenciesSection = memo(function DependenciesSection({
  taskId,
  predecessors = [],
  successors = [],
}: DependenciesSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showAddDialog, setShowAddDialog] = useState(false)

  const removeMutation = useMutation({
    mutationFn: (depId: string) => tasksApi.removeDependency(taskId, depId),
    onSuccess: () => {
      notify.success(t("tasks.dependencies.removed"))
      queryClient.invalidateQueries({ queryKey: ["task", taskId] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const hasDeps = predecessors.length > 0 || successors.length > 0

  // Collect IDs of already-linked tasks
  const existingDepIds = useMemo(() => {
    const ids = new Set<string>()
    predecessors.forEach((d) => {
      if (d.predecessor) ids.add(d.predecessor.id)
    })
    successors.forEach((d) => {
      if (d.successor) ids.add(d.successor.id)
    })
    return ids
  }, [predecessors, successors])

  return (
    <div>
      <AddDependencyDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        taskId={taskId}
        existingDepIds={existingDepIds}
      />

      {/* Add button */}
      <div className="flex justify-end mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="size-3.5 mr-1" />
          {t("common.add")}
        </Button>
      </div>

      {/* Predecessors (Blocked by) */}
      {predecessors.length > 0 && (
        <div className="pt-1 pb-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowLeft className="size-3 text-red-500" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("tasks.dependencies.blockedBy")}
            </span>
          </div>
          {predecessors.map((dep) => (
            <DependencyRow
              key={dep.id}
              dep={dep}
              taskId={taskId}
              direction="predecessor"
              onRemove={(id) => removeMutation.mutate(id)}
              isRemoving={removeMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Successors (Blocking) */}
      {successors.length > 0 && (
        <div className="pt-3 pb-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowRight className="size-3 text-amber-500" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("tasks.dependencies.blocking")}
            </span>
          </div>
          {successors.map((dep) => (
            <DependencyRow
              key={dep.id}
              dep={dep}
              taskId={taskId}
              direction="successor"
              onRemove={(id) => removeMutation.mutate(id)}
              isRemoving={removeMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasDeps && (
        <div className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            {t("tasks.dependencies.empty")}
          </p>
        </div>
      )}
    </div>
  )
})
