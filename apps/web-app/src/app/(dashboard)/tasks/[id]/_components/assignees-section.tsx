"use client"

import React, { useState, useCallback } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, X, Search, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi, usersApi, type TaskAssignee, type Worker } from "@/lib/api"
import { hasAccessModule } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

// ── Assignee Row ────────────────────────────────────────────────────────────

interface AssigneeRowProps {
  assignee: TaskAssignee
  canRemove: boolean
  onRemove: () => void
  isRemoving: boolean
  index: number
}

const AssigneeRow = React.memo(function AssigneeRow({
  assignee,
  canRemove,
  onRemove,
  isRemoving,
  index,
}: AssigneeRowProps) {
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors duration-150"
      style={{
        animation: `fadeSlideIn 0.25s ${APPLE_EASE} ${index * 40}ms both`,
      }}
    >
      {/* Avatar */}
      <UserAvatar
        firstName={assignee.user.firstName}
        lastName={assignee.user.lastName}
        avatarUrl={assignee.user.avatarUrl}
        seed={assignee.userId}
        size="md"
      />

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {assignee.user.firstName} {assignee.user.lastName}
        </p>
      </div>

      {/* Role badge */}
      <span
        className={cn(
          "flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide",
          assignee.role === "LEAD"
            ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
            : "bg-muted text-muted-foreground",
        )}
      >
        {assignee.role}
      </span>

      {/* Remove */}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={isRemoving}
          className="flex-shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all duration-150"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
})

// ── Add Assignee Dialog ─────────────────────────────────────────────────────

interface AddAssigneeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  existingUserIds: string[]
}

function AddAssigneeDialog({
  open,
  onOpenChange,
  taskId,
  existingUserIds,
}: AddAssigneeDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")

  const { data: workers, isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: () => usersApi.getWorkers(),
    enabled: open,
  })

  const addMutation = useMutation({
    mutationFn: (userId: string) => tasksApi.addAssignee(taskId, userId),
    onSuccess: () => {
      notify.success(t("tasks.assignees.added"))
      queryClient.invalidateQueries({ queryKey: ["task", taskId], refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  // A worker can only receive tasks if their Access Profile includes `tasks`.
  const canReceiveTasks = (w: Worker) =>
    hasAccessModule(w as Parameters<typeof hasAccessModule>[0], "tasks")

  const filtered = (workers || [])
    .filter((w: Worker) => {
      if (existingUserIds.includes(w.id)) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        w.firstName.toLowerCase().includes(q) ||
        w.lastName.toLowerCase().includes(q) ||
        w.email.toLowerCase().includes(q)
      )
    })
    // Assignable first; clock-only workers sink to the bottom (disabled).
    .sort((a: Worker, b: Worker) => Number(canReceiveTasks(b)) - Number(canReceiveTasks(a)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t("tasks.assignees.addTeamMember")}</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t("tasks.assignees.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-lg"
          />
        </div>

        {/* Worker list */}
        <div className="max-h-[280px] overflow-y-auto -mx-2 px-2 space-y-0.5">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 text-muted-foreground animate-spin" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("tasks.assignees.noTeamMembersFound")}
            </p>
          )}

          {filtered.map((worker: Worker) => {
              const assignable = canReceiveTasks(worker)
              return (
              <button
                key={worker.id}
                type="button"
                onClick={() => addMutation.mutate(worker.id)}
                disabled={addMutation.isPending || !assignable}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors duration-150 text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <UserAvatar
                  firstName={worker.firstName}
                  lastName={worker.lastName}
                  seed={worker.id}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {worker.firstName} {worker.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {assignable ? worker.email : t("tasks.create.cantReceiveTasks")}
                  </p>
                </div>
              </button>
              )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Assignees Section ───────────────────────────────────────────────────────

interface AssigneesSectionProps {
  taskId: string
  assignees: TaskAssignee[]
}

export const AssigneesSection = React.memo(function AssigneesSection({
  taskId,
  assignees,
}: AssigneesSectionProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showAddDialog, setShowAddDialog] = useState(false)

  const canManageAssignees = user?.canAssignTasks ?? false
  const leadCount = assignees.filter((a) => a.role === "LEAD").length

  const removeMutation = useMutation({
    mutationFn: (userId: string) => tasksApi.removeAssignee(taskId, userId),
    onSuccess: () => {
      notify.success(t("tasks.assignees.removed"))
      queryClient.invalidateQueries({ queryKey: ["task", taskId], refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const canRemoveAssignee = useCallback(
    (assignee: TaskAssignee) => {
      if (!canManageAssignees) return false
      // Can't remove the last LEAD
      if (assignee.role === "LEAD" && leadCount <= 1) return false
      return true
    },
    [canManageAssignees, leadCount],
  )

  const existingUserIds = assignees.map((a) => a.userId)

  return (
    <div>
      {/* Add button */}
      {canManageAssignees && (
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

      {/* List */}
      <div>
        {assignees.length === 0 ? (
          <p className="text-sm text-muted-foreground/60 text-center py-4">
            {t("tasks.assignees.noAssignees")}
          </p>
        ) : (
          assignees.map((assignee, index) => (
            <AssigneeRow
              key={assignee.id}
              assignee={assignee}
              canRemove={canRemoveAssignee(assignee)}
              onRemove={() => removeMutation.mutate(assignee.userId)}
              isRemoving={removeMutation.isPending}
              index={index}
            />
          ))
        )}
      </div>

      {/* Add dialog */}
      <AddAssigneeDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        taskId={taskId}
        existingUserIds={existingUserIds}
      />
    </div>
  )
})
