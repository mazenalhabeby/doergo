"use client"

import { useState, memo } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  ChevronRight,
  Loader2,
} from "lucide-react"

import { tasksApi, type Task } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/user-avatar"
import { notify } from "@/lib/toast"

// ---------------------------------------------------------------------------
// Status dot color map
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

const PRIORITY_ICONS: Record<string, { icon: string; color: string }> = {
  LOW: { icon: "\u2193", color: "text-slate-400" },
  MEDIUM: { icon: "\u2212", color: "text-blue-500" },
  HIGH: { icon: "\u2191", color: "text-orange-500" },
  URGENT: { icon: "\u26A0", color: "text-red-600" },
}

// ---------------------------------------------------------------------------
// SubtaskRow
// ---------------------------------------------------------------------------
const SubtaskRow = memo(function SubtaskRow({
  subtask,
  index,
}: {
  subtask: Task
  index: number
}) {
  const priorityInfo = PRIORITY_ICONS[subtask.priority] || PRIORITY_ICONS.MEDIUM
  const dotClass = STATUS_DOTS[subtask.status] || "bg-slate-400"

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
        <span className={cn("size-2 rounded-full shrink-0", dotClass)} />
      </div>

      {/* Title */}
      <span className="text-sm font-medium text-foreground flex-1 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {subtask.title}
      </span>

      {/* Priority */}
      <span className={cn("text-xs font-semibold shrink-0", priorityInfo.color)}>
        {priorityInfo.icon}
      </span>

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
}

export const SubtasksSection = memo(function SubtasksSection({
  taskId,
  subtasks: initialSubtasks,
  subtaskCount,
}: SubtasksSectionProps) {
  const queryClient = useQueryClient()
  const [showInput, setShowInput] = useState(false)
  const [newTitle, setNewTitle] = useState("")

  // Fetch subtasks
  const { data: fetchedSubtasks } = useQuery({
    queryKey: ["subtasks", taskId],
    queryFn: () => tasksApi.getSubtasks(taskId),
    initialData: initialSubtasks,
    staleTime: 30000,
  })

  const subtasks = fetchedSubtasks || initialSubtasks || []
  const count = subtaskCount ?? subtasks.length

  // Create subtask mutation
  const createMutation = useMutation({
    mutationFn: (title: string) =>
      tasksApi.createSubtask(taskId, { title, description: "" }),
    onSuccess: () => {
      notify.success("Subtask created")
      setNewTitle("")
      setShowInput(false)
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] })
      queryClient.invalidateQueries({ queryKey: ["task", taskId] })
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

      {/* Add button */}
      <div className="flex justify-end mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowInput(true)}
        >
          <Plus className="size-3.5 mr-1" />
          Add
        </Button>
      </div>

      {/* Subtask list */}
      {subtasks.length > 0 && (
        <div className="divide-y divide-border/30">
          {subtasks.map((subtask, index) => (
            <SubtaskRow key={subtask.id} subtask={subtask} index={index} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {subtasks.length === 0 && !showInput && (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No subtasks yet. Break this task into smaller steps.
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
            placeholder="Subtask title..."
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
              "Add"
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
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
})
