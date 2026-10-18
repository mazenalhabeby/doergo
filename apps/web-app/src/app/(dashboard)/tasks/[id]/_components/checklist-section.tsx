"use client"

import { keys } from "@/lib/query-keys"
import React, { useState, useCallback } from "react"
import type { Task } from "@/lib/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"

import { tasksApi, type ChecklistItem } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { useJobTime } from "@/hooks/use-job-time"
import { useTaskPermissions } from "@/hooks/use-task-permissions"
import { APPLE_EASE, ChecklistItemRow, type ChecklistSectionProps } from "./checklist-item-row"

export const ChecklistSection = React.memo(function ChecklistSection({
  taskId,
  items,
  paused = false,
  spaceId = null,
}: ChecklistSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // The crew rides on the job-time read the crew card already makes — one cached request, not two.
  const { data: jobTime } = useJobTime(taskId, paused)
  const crew = jobTime?.crew ?? null
  const { user } = useAuth()
  // The server's rule (CrewService.checklistAuthority): "assign tasks" org-wide or in THIS job's space, or leading it now.
  const { canAssign } = useTaskPermissions({ spaceId })
  const mayHandOut = canAssign || (!!user?.id && crew?.leader.userId === user.id)
  const [newItemText, setNewItemText] = useState("")

  const sorted = [...items].sort((a, b) => a.position - b.position)
  const completed = sorted.filter((i) => i.isCompleted).length
  const total = sorted.length
  const progress = total > 0 ? (completed / total) * 100 : 0

  // ── Mutations ──

  const invalidateTask = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: keys.tasks.detail(taskId), refetchType: "all" })
  }, [queryClient, taskId])

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, isCompleted }: { itemId: string; isCompleted: boolean }) =>
      tasksApi.updateChecklistItem(taskId, itemId, { isCompleted }),
    onMutate: async ({ itemId, isCompleted }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: keys.tasks.detail(taskId) })
      queryClient.setQueryData<Task | undefined>(keys.tasks.detail(taskId), (old) => {
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

  // `mutate` is stable across renders — the rows stay memoized while the job time ticks.
  const { mutate: changeOwner } = useMutation({
    mutationFn: ({ itemId, assigneeId }: { itemId: string; assigneeId: string | null }) =>
      tasksApi.updateChecklistItem(taskId, itemId, { assigneeId }),
    onError: (e: Error) => notify.error(e.message),
    onSettled: invalidateTask,
  })
  const handleOwner = useCallback(
    (itemId: string, assigneeId: string | null) => changeOwner({ itemId, assigneeId }),
    [changeOwner],
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
              meId={user?.id ?? null}
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
