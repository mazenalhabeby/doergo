"use client"

import React, { useState, useCallback } from "react"
import type { Task } from "@/lib/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"

import { tasksApi, type ChecklistItem, type CrewView } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { useJobTime } from "@/hooks/use-job-time"
import { tickedByOther } from "@hbcfield/shared/client"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

// ── Single checklist item ───────────────────────────────────────────────────

interface ChecklistItemRowProps {
  item: ChecklistItem
  taskId: string
  onToggle: (itemId: string, isCompleted: boolean) => void
  onDelete: (itemId: string) => void
  isDeleting: boolean
  /** The crew, when the job has one: owners are picked from it (shared tasks/checklist.ts). */
  crew: CrewView | null
  /** The leader or the office: may give the item to anybody on the crew. The server judges it again. */
  mayHandOut: boolean
  onOwner: (itemId: string, assigneeId: string | null) => void
}

const ChecklistItemRow = React.memo(function ChecklistItemRow({
  item,
  taskId,
  onToggle,
  onDelete,
  isDeleting,
  crew,
  mayHandOut,
  onOwner,
}: ChecklistItemRowProps) {
  const { t } = useTranslation()
  const name = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : "")
  const at = item.completedAt ? new Date(item.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""
  const doneLine = item.isCompleted && item.completedBy
    ? tickedByOther(item)
      ? t("tasks.checklist.doneFor", { owner: item.assignee?.firstName ?? "", name: name(item.completedBy), time: at })
      : t("tasks.checklist.doneBy", { name: name(item.completedBy), time: at })
    : null
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 rounded-lg",
        "hover:bg-accent/50 transition-colors duration-150",
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={() => onToggle(item.id, !item.isCompleted)}
        className={cn(
          "flex-shrink-0 size-[18px] rounded-[5px] border-2 flex items-center justify-center",
          "transition-all duration-200",
          item.isCompleted
            ? "bg-blue-600 border-blue-600"
            : "border-border hover:border-blue-400",
        )}
        style={{ transitionTimingFunction: APPLE_EASE }}
      >
        {item.isCompleted && <Check className="size-3 text-white" strokeWidth={3} />}
      </button>

      {/* Text, and who ticked it */}
      <span className="flex-1 min-w-0 flex flex-col">
        <span
          className={cn(
            "text-sm transition-all duration-200",
            item.isCompleted
              ? "text-muted-foreground line-through"
              : "text-foreground",
          )}
        >
          {item.text}
        </span>
        {doneLine && <span className="text-xs text-muted-foreground">{doneLine}</span>}
      </span>

      {/* Owner — only on a job with a crew */}
      {crew && crew.members.length > 1 && (
        mayHandOut ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex-shrink-0 text-xs rounded-full px-2.5 py-1 border transition-colors",
                  item.assignee ? "border-border text-foreground hover:bg-accent" : "border-dashed border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {item.assignee ? name(item.assignee) : t("tasks.checklist.giveTo")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {crew.members.map((m) => (
                <DropdownMenuItem key={m.user.id} onSelect={() => onOwner(item.id, m.user.id)}>
                  {item.assigneeId === m.user.id ? "✓ " : ""}{name(m.user)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onOwner(item.id, null)}>{t("tasks.checklist.nobody")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : item.assignee ? (
          <span className="flex-shrink-0 text-xs rounded-full px-2.5 py-1 bg-muted text-muted-foreground">{name(item.assignee)}</span>
        ) : null
      )}

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        disabled={isDeleting}
        className="flex-shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all duration-150"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
})

// ── Checklist Section ───────────────────────────────────────────────────────

interface ChecklistSectionProps {
  taskId: string
  items: ChecklistItem[]
  /** The job is paused — passed on to the shared job-time read the crew comes from. */
  paused?: boolean
}

export const ChecklistSection = React.memo(function ChecklistSection({
  taskId,
  items,
  paused = false,
}: ChecklistSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // The crew rides on the job-time read the crew card already makes — one cached request, not two.
  const { data: jobTime } = useJobTime(taskId, paused)
  const crew = jobTime?.crew ?? null
  const { user, hasPermission } = useAuth()
  const mayHandOut = user?.role === "ADMIN" || hasPermission("canAssignTasks") || (!!user?.id && crew?.leader.userId === user.id)
  const [newItemText, setNewItemText] = useState("")

  const sorted = [...items].sort((a, b) => a.position - b.position)
  const completed = sorted.filter((i) => i.isCompleted).length
  const total = sorted.length
  const progress = total > 0 ? (completed / total) * 100 : 0

  // ── Mutations ──

  const invalidateTask = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["task", taskId], refetchType: "all" })
  }, [queryClient, taskId])

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, isCompleted }: { itemId: string; isCompleted: boolean }) =>
      tasksApi.updateChecklistItem(taskId, itemId, { isCompleted }),
    onMutate: async ({ itemId, isCompleted }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["task", taskId] })
      queryClient.setQueryData<Task | undefined>(["task", taskId], (old) => {
        if (!old?.checklistItems) return old
        return {
          ...old,
          checklistItems: old.checklistItems.map((i: ChecklistItem) =>
            i.id === itemId ? { ...i, isCompleted } : i,
          ),
        }
      })
    },
    onError: (_err, _vars, _ctx) => {
      invalidateTask()
      notify.error(t("tasks.checklist.updateFailed"))
    },
    onSettled: invalidateTask,
  })

  const ownerMutation = useMutation({
    mutationFn: ({ itemId, assigneeId }: { itemId: string; assigneeId: string | null }) =>
      tasksApi.updateChecklistItem(taskId, itemId, { assigneeId }),
    onError: (e: Error) => notify.error(e.message),
    onSettled: invalidateTask,
  })
  const handleOwner = useCallback(
    (itemId: string, assigneeId: string | null) => ownerMutation.mutate({ itemId, assigneeId }),
    [ownerMutation],
  )

  const addMutation = useMutation({
    mutationFn: (text: string) => tasksApi.addChecklistItem(taskId, text),
    onSuccess: () => {
      setNewItemText("")
      invalidateTask()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => tasksApi.deleteChecklistItem(taskId, itemId),
    onSuccess: invalidateTask,
    onError: (e: Error) => notify.error(e.message),
  })

  const handleToggle = useCallback(
    (itemId: string, isCompleted: boolean) => {
      toggleMutation.mutate({ itemId, isCompleted })
    },
    [toggleMutation],
  )

  const handleDelete = useCallback(
    (itemId: string) => {
      deleteMutation.mutate(itemId)
    },
    [deleteMutation],
  )

  const handleAddItem = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const text = newItemText.trim()
      if (!text || addMutation.isPending) return
      addMutation.mutate(text)
    },
    [newItemText, addMutation],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        const text = newItemText.trim()
        if (!text || addMutation.isPending) return
        addMutation.mutate(text)
      }
    },
    [newItemText, addMutation],
  )

  return (
    <>
      {/* Progress bar */}
      {total > 0 && (
        <div className="pt-1">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progress === 100 ? "bg-green-500" : "bg-blue-500",
              )}
              style={{
                width: `${progress}%`,
                transitionTimingFunction: APPLE_EASE,
              }}
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="pt-2">
        {sorted.map((item, index) => (
          <div
            key={item.id}
            style={{
              animation: `fadeSlideIn 0.25s ${APPLE_EASE} ${index * 30}ms both`,
            }}
          >
            <ChecklistItemRow
              item={item}
              taskId={taskId}
              onToggle={handleToggle}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
              crew={crew}
              mayHandOut={mayHandOut}
              onOwner={handleOwner}
            />
          </div>
        ))}

        {/* Add new item */}
        <form onSubmit={handleAddItem} className="flex items-center gap-2 px-3 pt-2">
          <div className="flex-shrink-0 size-[18px] rounded-[5px] border-2 border-dashed border-border/60 flex items-center justify-center">
            <Plus className="size-3 text-muted-foreground/50" />
          </div>
          <input
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("tasks.checklist.addItemPlaceholder")}
            disabled={addMutation.isPending}
            className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground/50 text-foreground"
          />
        </form>
      </div>
    </>
  )
})
