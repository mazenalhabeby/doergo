"use client"

import { keys } from "@/lib/query-keys"
import { useState, memo } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  ChevronRight,
  Loader2,
} from "lucide-react"

import { tasksApi, type Task, type WorkflowStatus } from "@/lib/api"
import { getPriorityConfig, type StatusConfig } from "@/lib/constants"
import { useRelatedStepConfigs } from "@/hooks/use-step-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/common/user-avatar"
import { notify } from "@/lib/toast"

// ---------------------------------------------------------------------------
// SubtaskRow
// ---------------------------------------------------------------------------
const SubtaskRow = memo(function SubtaskRow({
  subtask,
  index,
  step,
}: {
  subtask: Task
  index: number
  step: StatusConfig
}) {
  const priority = getPriorityConfig(subtask.priority || "MEDIUM")
  const PriorityIcon = priority.icon

  const checklist = subtask.checklistItems || []
  const completed = checklist.filter((c) => c.isCompleted).length
  const total = checklist.length
  const hasChecklist = total > 0

  return (
    <Link
      href={`/tasks/${subtask.id}`}
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 rounded-lg",
        "hover:bg-muted/60 transition-colors duration-150",
        "border-b border-border/30 last:border-b-0",
      )}
      style={{
        animation: `fadeSlideIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) ${index * 0.04}s both`,
      }}
    >
      {/* Indent marker */}
      <div className="flex items-center gap-2 pl-2">
        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: step.hex }} title={step.label} />
      </div>

      {/* Title */}
      <span
        className={"text-sm font-medium text-foreground flex-1 truncate " +
          "group-hover:text-blue-600 dark:group-hover:text-blue-400 " +
          "transition-colors"}>
        {subtask.title}
      </span>

      {/* Priority */}
      <PriorityIcon className="size-3 shrink-0" style={{ color: priority.hex }} aria-label={priority.label} />

      {/* Assignee avatar */}
      {subtask.assignedTo && (
        <UserAvatar
          firstName={subtask.assignedTo.firstName}
          lastName={subtask.assignedTo.lastName}
          avatarUrl={subtask.assignedTo.avatarUrl}
          seed={subtask.assignedTo.id}
          size="xs"
        />
      )}

      {/* Checklist progress */}
      {hasChecklist && (
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {completed}/{total}
        </span>
      )}

      <ChevronRight className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
    </Link>
  )
})

// ---------------------------------------------------------------------------
// SubtasksSection
// ---------------------------------------------------------------------------
interface SubtasksSectionProps {
  taskId: string
  subtasks?: Task[]
  subtaskCount?: number
  /** May this viewer add subtasks? Space-aware, from the page. */
  canEdit?: boolean
  /** This task's flow — a subtask without a flow of its own is drawn in it. */
  workflowStatuses?: readonly WorkflowStatus[] | null
}

export const SubtasksSection = memo(function SubtasksSection({
  taskId,
  subtasks: initialSubtasks,
  subtaskCount,
  canEdit = true,
  workflowStatuses,
}: SubtasksSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showInput, setShowInput] = useState(false)
  const [newTitle, setNewTitle] = useState("")

  // Fetch subtasks
  const { data: fetchedSubtasks } = useQuery({
    queryKey: keys.taskExtras.subtasks(taskId),
    queryFn: () => tasksApi.getSubtasks(taskId),
    initialData: initialSubtasks,
    staleTime: 30000,
  })

  const subtasks = fetchedSubtasks || initialSubtasks || []
  const count = subtaskCount ?? subtasks.length
  const stepOf = useRelatedStepConfigs(subtasks, workflowStatuses)

  // Create subtask mutation
  const createMutation = useMutation({
    mutationFn: (title: string) =>
      tasksApi.createSubtask(taskId, { title, description: "" }),
    onSuccess: () => {
      notify.success(t("tasks.subtasks.created"))
      setNewTitle("")
      setShowInput(false)
      queryClient.invalidateQueries({ queryKey: keys.taskExtras.subtasks(taskId) })
      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(taskId) })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const handleSubmit = () => {
    const trimmed = newTitle.trim()
    if (!trimmed || createMutation.isPending) return
    createMutation.mutate(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape") {
      setShowInput(false)
      setNewTitle("")
    }
  }

  return (
    <div>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/*
        Add — only for somebody who may actually add.

        The control used to render for anyone who could SEE the task, and the
        server refused on submit: a supervisor granted "create tasks" in their
        space got a permission error from a button the app had offered them. A
        control you are not allowed to use should not be there.
      */}
      {canEdit && (
      <div className="flex justify-end mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowInput(true)}
        >
          <Plus className="size-3.5 mr-1" />
          {t("common.add")}
        </Button>
      </div>
      )}

      {/* Subtask list */}
      {subtasks.length > 0 && (
        <div className="divide-y divide-border/30">
          {subtasks.map((subtask, index) => (
            <SubtaskRow key={subtask.id} subtask={subtask} index={index} step={stepOf(subtask)} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {subtasks.length === 0 && !showInput && (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            {t("tasks.subtasks.empty")}
          </p>
        </div>
      )}

      {/* Add subtask input */}
      {showInput && (
        <div className="px-4 py-3 border-t border-border/40 flex items-center gap-2">
          <div className="pl-2">
            <span className="size-2 rounded-full bg-blue-500 block" />
          </div>
          <Input
            autoFocus
            placeholder={t("tasks.subtasks.titlePlaceholder")}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={createMutation.isPending}
            className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
          />
          <Button
            size="sm"
            className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSubmit}
            disabled={!newTitle.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              t("common.add")
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setShowInput(false)
              setNewTitle("")
            }}
          >
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </div>
  )
})
