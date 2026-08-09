"use client"

import { useRouter } from "next/navigation"
import { ClipboardList, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useTimeFormat } from "@/hooks"
import { type Task } from "@/lib/api"
import { getStatusConfig } from "@/lib/constants"

interface TasksTabProps {
  tasks: Task[] | undefined
}

// Priority accent — a small colored dot + label, consistent with the app's
// LOW/MEDIUM/HIGH/URGENT palette.
const PRIORITY_HEX: Record<string, string> = {
  LOW: "#94a3b8",
  MEDIUM: "#3b82f6",
  HIGH: "#f97316",
  URGENT: "#dc2626",
}

export function TasksTab({ tasks }: TasksTabProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { formatDate } = useTimeFormat()

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardList className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("technicians.tasksTab.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("technicians.tasksTab.description")}</p>
        </div>
      </div>

      {tasks && tasks.length > 0 ? (
        <div className="divide-y divide-border/60">
          {tasks.map((task: Task) => {
            const statusConfig = getStatusConfig(task.status)
            const priorityHex = PRIORITY_HEX[task.priority ?? ""] ?? "#94a3b8"
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => router.push(`/tasks/${task.id}`)}
                className="group w-full flex items-center gap-3 px-5 py-3.5 hover:bg-accent/40 transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: priorityHex }} />
                      {task.priority?.toLowerCase() || "—"}
                    </span>
                    <span className="hidden sm:inline">
                      {t("technicians.tasksTab.dueDateColumn")}: {task.dueDate ? formatDate(task.dueDate) : "—"}
                    </span>
                    <span className="hidden md:inline text-muted-foreground/70">
                      {formatDate(task.createdAt)}
                    </span>
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium flex-shrink-0"
                  style={{ borderColor: `${statusConfig.hex}33`, color: statusConfig.hex, backgroundColor: `${statusConfig.hex}14` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusConfig.hex }} />
                  {statusConfig.label}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="px-5 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
            <ClipboardList className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t("technicians.tasksTab.noTasks")}</p>
        </div>
      )}
    </div>
  )
}
