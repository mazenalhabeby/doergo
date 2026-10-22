"use client"

import Link from "next/link"
import { type Task } from "@/lib/api"
import { getStatusConfig } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDayMonth } from "@/lib/format-date"
import type { MemberProfilePageState } from "../_hooks/use-member-profile-page"

/** Part of MemberProfilePage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MemberProfilePageDetail({ vm }: { vm: MemberProfilePageState }) {
  const {
    t,
    tasksLoading,
    tasks,
    router,
    memberId,
    memberLoading,
    memberError,
    member,
  } = vm
  if ((memberLoading)) return null
  if ((memberError)) return null
  if ((!member)) return null
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border/60">
        <h2 className="text-sm font-semibold text-foreground">{t("members.detail.recentTasks")}</h2>
      </div>
      {tasksLoading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : tasks.length > 0 ? (
        <>
          <div className="divide-y divide-border/60">
            {tasks.slice(0, 5).map((task: Task) => {
              const statusConfig = getStatusConfig(task.status)
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => router.push(`/tasks/${task.id}`)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-accent/40 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    {task.dueDate && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("members.detail.due", { date: formatDayMonth(task.dueDate, false) })}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[11px] font-medium border flex-shrink-0"
                    style={{ borderColor: `${statusConfig.hex}33`, color: statusConfig.hex, backgroundColor: `${statusConfig.hex}14` }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full mr-1.5 flex-shrink-0"
                      style={{ backgroundColor: statusConfig.hex }}
                    />
                    {statusConfig.label}
                  </Badge>
                </button>
              )
            })}
          </div>
          <div className="px-5 py-3 border-t border-border/60">
            <Link
              href={`/tasks?assignee=${memberId}`}
              className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              {t("members.detail.viewAllTasks")}
            </Link>
          </div>
        </>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("members.detail.noTasksAssigned")}</p>
        </div>
      )}
    </div>
  )
}
