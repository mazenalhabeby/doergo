"use client"

import { useState, useCallback, memo } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Star,
  Loader2,
  GitBranch,
  ArrowRight,
  Circle,
  AlertCircle,
  Check,
} from "lucide-react"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import {
  workflowsApi,
  type StatusWorkflow,
  type WorkflowStatus,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#22c55e",
  "#eab308", "#f97316", "#ef4444", "#ec4899", "#8b5cf6",
  "#64748b", "#0ea5e9",
]

// ============================================================================
// Status Badge Component
// ============================================================================

const StatusDot = memo(function StatusDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  )
})

// ============================================================================
// Status Item Row
// ============================================================================

const StatusRow = memo(function StatusRow({
  status,
  workflowId,
  allStatuses,
  onEdit,
  onDelete,
}: {
  status: WorkflowStatus
  workflowId: string
  allStatuses: WorkflowStatus[]
  onEdit: (s: WorkflowStatus) => void
  onDelete: (s: WorkflowStatus) => void
}) {
  const transitionNames = status.transitions
    .map((key) => allStatuses.find((s) => s.key === key)?.name)
    .filter(Boolean)

  return (
    <div className="flex items-center gap-4 py-3 px-4 rounded-xl hover:bg-muted/50 transition-colors group">
      <StatusDot color={status.color} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{status.name}</span>
          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {status.key}
          </span>
          {status.isFinal && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Final
            </span>
          )}
          {status.isCanceled && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              Canceled
            </span>
          )}
          {status.wipLimit != null && status.wipLimit > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              WIP: {status.wipLimit}
            </span>
          )}
        </div>
        {transitionNames.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              {transitionNames.join(", ")}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onEdit(status)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={() => onDelete(status)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
})

// ============================================================================
// Workflow Card
// ============================================================================

const WorkflowCard = memo(function WorkflowCard({
  workflow,
  onSetDefault,
  onDelete,
  onAddStatus,
  onEditStatus,
  onDeleteStatus,
}: {
  workflow: StatusWorkflow
  onSetDefault: (id: string) => void
  onDelete: (id: string) => void
  onAddStatus: (workflowId: string) => void
  onEditStatus: (workflowId: string, status: WorkflowStatus) => void
  onDeleteStatus: (workflowId: string, status: WorkflowStatus) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const statuses = workflow.statuses || []

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      {/* Card Header */}
      <div
        className="flex items-center gap-4 px-6 py-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
          <GitBranch className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{workflow.name}</h3>
            {workflow.isDefault && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Star className="h-3 w-3" />
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {statuses.length} {statuses.length === 1 ? "status" : "statuses"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!workflow.isDefault && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onSetDefault(workflow.id)
              }}
            >
              Set Default
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(workflow.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded: Status List */}
      {expanded && (
        <div className="border-t border-border">
          <div className="p-4 space-y-0.5">
            {statuses.length === 0 ? (
              <div className="text-center py-6">
                <Circle className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No statuses defined yet</p>
              </div>
            ) : (
              statuses
                .sort((a, b) => a.position - b.position)
                .map((status) => (
                  <StatusRow
                    key={status.id}
                    status={status}
                    workflowId={workflow.id}
                    allStatuses={statuses}
                    onEdit={(s) => onEditStatus(workflow.id, s)}
                    onDelete={(s) => onDeleteStatus(workflow.id, s)}
                  />
                ))
            )}
          </div>
          <div className="px-4 pb-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-xl border-dashed"
              onClick={() => onAddStatus(workflow.id)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Status
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Create Workflow Dialog
// ============================================================================

function CreateWorkflowDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")

  const mutation = useMutation({
    mutationFn: () => workflowsApi.create({ name }),
    onSuccess: () => {
      notify.success("Workflow created")
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      setName("")
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Workflow</DialogTitle>
          <DialogDescription>
            Create a new status workflow for your organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g. Field Service, Bug Tracking..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && mutation.mutate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Add/Edit Status Dialog
// ============================================================================

function StatusDialog({
  open,
  onOpenChange,
  workflowId,
  existingStatus,
  allStatuses,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  existingStatus: WorkflowStatus | null
  allStatuses: WorkflowStatus[]
}) {
  const queryClient = useQueryClient()
  const isEditing = !!existingStatus

  const [name, setName] = useState(existingStatus?.name || "")
  const [key, setKey] = useState(existingStatus?.key || "")
  const [color, setColor] = useState(existingStatus?.color || STATUS_COLORS[0]!)
  const [isFinal, setIsFinal] = useState(existingStatus?.isFinal || false)
  const [isCanceled, setIsCanceled] = useState(existingStatus?.isCanceled || false)
  const [wipLimit, setWipLimit] = useState<string>(
    existingStatus?.wipLimit != null ? String(existingStatus.wipLimit) : "",
  )
  const [selectedTransitions, setSelectedTransitions] = useState<string[]>(
    existingStatus?.transitions || [],
  )

  const autoKey = useCallback((n: string) => {
    return n.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "")
  }, [])

  const parsedWipLimit = wipLimit.trim() ? parseInt(wipLimit, 10) : undefined
  const effectiveWipLimit = parsedWipLimit && parsedWipLimit > 0 ? parsedWipLimit : undefined

  const createMutation = useMutation({
    mutationFn: () =>
      workflowsApi.addStatus(workflowId, {
        name,
        key,
        color,
        isFinal,
        isCanceled,
        transitions: selectedTransitions,
        position: allStatuses.length,
        wipLimit: effectiveWipLimit ?? null,
      }),
    onSuccess: () => {
      notify.success("Status added")
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      workflowsApi.updateStatus(workflowId, existingStatus!.id, {
        name,
        color,
        isFinal,
        isCanceled,
        transitions: selectedTransitions,
        wipLimit: effectiveWipLimit ?? null,
      } as Partial<WorkflowStatus>),
    onSuccess: () => {
      notify.success("Status updated")
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const mutation = isEditing ? updateMutation : createMutation
  const otherStatuses = allStatuses.filter((s) => s.id !== existingStatus?.id)

  const toggleTransition = (statusKey: string) => {
    setSelectedTransitions((prev) =>
      prev.includes(statusKey)
        ? prev.filter((k) => k !== statusKey)
        : [...prev, statusKey],
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Status" : "Add Status"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the status properties."
              : "Add a new status to this workflow."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">
          {/* Name & Key */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g. In Review"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!isEditing) setKey(autoKey(e.target.value))
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Key</Label>
              <Input
                placeholder="IN_REVIEW"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                disabled={isEditing}
                className={isEditing ? "opacity-60" : ""}
              />
            </div>
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-7 w-7 rounded-lg border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: c === color ? "var(--foreground)" : "transparent",
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Flags */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Final Status</Label>
                <p className="text-xs text-muted-foreground">
                  Marks the task as complete
                </p>
              </div>
              <Switch checked={isFinal} onCheckedChange={setIsFinal} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Canceled Status</Label>
                <p className="text-xs text-muted-foreground">
                  Marks the task as canceled
                </p>
              </div>
              <Switch checked={isCanceled} onCheckedChange={setIsCanceled} />
            </div>
          </div>

          {/* WIP Limit */}
          {!isFinal && !isCanceled && (
            <div className="space-y-2">
              <div>
                <Label className="text-sm">WIP Limit</Label>
                <p className="text-xs text-muted-foreground">
                  Maximum tasks allowed in this status on the kanban board
                </p>
              </div>
              <Input
                type="number"
                min={0}
                placeholder="No limit"
                value={wipLimit}
                onChange={(e) => setWipLimit(e.target.value)}
                className="w-32"
              />
            </div>
          )}

          {/* Transitions */}
          {otherStatuses.length > 0 && (
            <div className="space-y-2">
              <Label>Can transition to</Label>
              <div className="flex flex-wrap gap-2">
                {otherStatuses.map((s) => {
                  const selected = selectedTransitions.includes(s.key)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        selected
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => toggleTransition(s.key)}
                    >
                      <StatusDot color={s.color} size={8} />
                      {s.name}
                      {selected && <Check className="h-3 w-3" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !key.trim() || mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function WorkflowsSettingsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean
    workflowId: string
    existingStatus: WorkflowStatus | null
    allStatuses: WorkflowStatus[]
  }>({ open: false, workflowId: "", existingStatus: null, allStatuses: [] })
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "workflow" | "status"
    workflowId: string
    statusId?: string
    name: string
  } | null>(null)

  // Only ADMIN can access
  if (user?.role !== "ADMIN") {
    router.push("/dashboard")
    return null
  }

  const { data: workflows, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => workflowsApi.setDefault(id),
    onSuccess: () => {
      notify.success("Default workflow updated")
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteWorkflowMutation = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(id),
    onSuccess: () => {
      notify.success("Workflow deleted")
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteStatusMutation = useMutation({
    mutationFn: ({ workflowId, statusId }: { workflowId: string; statusId: string }) =>
      workflowsApi.deleteStatus(workflowId, statusId),
    onSuccess: () => {
      notify.success("Status deleted")
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const handleDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === "workflow") {
      deleteWorkflowMutation.mutate(deleteTarget.workflowId)
    } else if (deleteTarget.statusId) {
      deleteStatusMutation.mutate({
        workflowId: deleteTarget.workflowId,
        statusId: deleteTarget.statusId,
      })
    }
  }

  return (
    <div className="min-h-full bg-muted/30">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Status Workflows</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define custom status flows for your tasks
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 rounded-xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Workflow
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : !workflows || workflows.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
            <div className="flex items-center justify-center h-14 w-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 mb-4">
              <GitBranch className="h-7 w-7 text-indigo-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No workflows yet
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Create your first status workflow to define how tasks move through
              different stages.
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 rounded-xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Workflow
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onSetDefault={(id) => setDefaultMutation.mutate(id)}
                onDelete={(id) =>
                  setDeleteTarget({
                    type: "workflow",
                    workflowId: id,
                    name: workflow.name,
                  })
                }
                onAddStatus={(wfId) => {
                  const wf = workflows.find((w) => w.id === wfId)
                  setStatusDialog({
                    open: true,
                    workflowId: wfId,
                    existingStatus: null,
                    allStatuses: wf?.statuses || [],
                  })
                }}
                onEditStatus={(wfId, status) => {
                  const wf = workflows.find((w) => w.id === wfId)
                  setStatusDialog({
                    open: true,
                    workflowId: wfId,
                    existingStatus: status,
                    allStatuses: wf?.statuses || [],
                  })
                }}
                onDeleteStatus={(wfId, status) =>
                  setDeleteTarget({
                    type: "status",
                    workflowId: wfId,
                    statusId: status.id,
                    name: status.name,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateWorkflowDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {statusDialog.open && (
        <StatusDialog
          open={statusDialog.open}
          onOpenChange={(open) =>
            setStatusDialog((prev) => ({ ...prev, open }))
          }
          workflowId={statusDialog.workflowId}
          existingStatus={statusDialog.existingStatus}
          allStatuses={statusDialog.allStatuses}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === "workflow" ? "Workflow" : "Status"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
