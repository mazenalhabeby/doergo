"use client"

import { keys } from "@/lib/query-keys"
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

import { tasksApi, type Task, type TaskDependency, type WorkflowStatus } from "@/lib/api"
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
import { notify } from "@/lib/toast"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { stepConfig, useRelatedStepConfigs } from "@/hooks/use-step-config"
import { useAddDependencyDialog } from "./use-add-dependency-dialog"
import { DEP_TYPE_LABELS, DEP_TYPE_KEYS } from "./add-dependency-dialog-helpers"
import { AddDependencyDialogDependencies } from "./add-dependency-dialog-dependencies"

// ---------------------------------------------------------------------------
// DependencyRow
// ---------------------------------------------------------------------------
const DependencyRow = memo(function DependencyRow({
  dep,
  taskId,
  direction,
  onRemove,
  isRemoving,
  canEdit,
  workflowStatuses,
}: {
  dep: TaskDependency
  taskId: string
  direction: "predecessor" | "successor"
  onRemove: (depId: string) => void
  isRemoving: boolean
  canEdit: boolean
  /** The flow of the task on this page; a linked task carries no flow of its own here. */
  workflowStatuses?: readonly WorkflowStatus[] | null
}) {
  const linked =
    direction === "predecessor" ? dep.predecessor : dep.successor
  if (!linked) return null

  const step = stepConfig(linked.status, workflowStatuses)

  return (
    <div className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/40 transition-colors rounded-lg">
      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: step.hex }} title={step.label} />
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
      {canEdit && (
        <button
          onClick={() => onRemove(dep.id)}
          disabled={isRemoving}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-all shrink-0"
        >
          <X className="size-3.5" />
        </button>
      )}
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
  workflowStatuses,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  existingDepIds: Set<string>
  workflowStatuses?: readonly WorkflowStatus[] | null
}) {
  const vm = useAddDependencyDialog({ open, onOpenChange, taskId, existingDepIds, workflowStatuses })
  const {
    t,
    search,
    setSearch,
    depType,
    setDepType,
    searching,
    filteredResults,
    stepOf,
    addMutation,
  } = vm

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AddDependencyDialogDependencies vm={vm} />
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
  /** May this viewer change the ordering? Space-aware, from the page. */
  canEdit?: boolean
  /** This task's flow — how a linked task's step is drawn. */
  workflowStatuses?: readonly WorkflowStatus[] | null
}

export const DependenciesSection = memo(function DependenciesSection({
  taskId,
  predecessors = [],
  successors = [],
  canEdit = true,
  workflowStatuses,
}: DependenciesSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showAddDialog, setShowAddDialog] = useState(false)

  const removeMutation = useMutation({
    mutationFn: (depId: string) => tasksApi.removeDependency(taskId, depId),
    onSuccess: () => {
      notify.success(t("tasks.dependencies.removed"))
      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(taskId) })
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
        workflowStatuses={workflowStatuses}
      />

      {/*
        Add — and the remove buttons on each row — only for somebody who may
        actually change the ordering. Both used to render for any viewer and
        fail at the server.
      */}
      {canEdit && (
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
      )}

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
              canEdit={canEdit}
              workflowStatuses={workflowStatuses}
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
              canEdit={canEdit}
              workflowStatuses={workflowStatuses}
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
