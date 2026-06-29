"use client"

import React, { useState, useCallback } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"

import { tasksApi, type ChecklistItem } from "@/lib/api"
import { cn } from "@/lib/utils"

const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

// ── Single checklist item ───────────────────────────────────────────────────

interface ChecklistItemRowProps {
  item: ChecklistItem
  taskId: string
  onToggle: (itemId: string, isCompleted: boolean) => void
  onDelete: (itemId: string) => void
  isDeleting: boolean
}

const ChecklistItemRow = React.memo(function ChecklistItemRow({
  item,
  taskId,
  onToggle,
  onDelete,
  isDeleting,
}: ChecklistItemRowProps) {
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

      {/* Text */}
      <span
        className={cn(
          "flex-1 text-sm transition-all duration-200",
          item.isCompleted
            ? "text-muted-foreground line-through"
            : "text-foreground",
        )}
      >
        {item.text}
      </span>

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
}

export const ChecklistSection = React.memo(function ChecklistSection({
  taskId,
  items,
}: ChecklistSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
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
      queryClient.setQueryData(["task", taskId], (old: any) => {
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
