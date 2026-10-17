"use client"

import { type Task } from "@/lib/api"
import { getStatusConfig } from "@/lib/constants"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRelativeDay } from "@/lib/format-date"
import type { MemberProfilePageState } from "./use-member-profile-page"

/** Part of MemberProfilePage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MemberProfilePageDetail2({ vm }: { vm: MemberProfilePageState }) {
  const { t, tasksLoading, tasks, memberLoading, memberError, member } = vm
  if ((memberLoading)) return null
  if ((memberError)) return null
  if ((!member)) return null
  return (
    <div className="bg-card rounded-xl border border-border/80 overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60">
        <h2 className="text-sm font-semibold text-foreground">{t("members.detail.activity")}</h2>
      </div>
      {tasksLoading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-3 w-20 ml-auto" />
            </div>
          ))}
        </div>
      ) : tasks.length > 0 ? (
        <div className="divide-y divide-border/40">
          {tasks.slice(0, 5).map((task: Task) => {
            const statusConfig = getStatusConfig(task.status)
            return (
              <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.hex }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{task.title}</span>
                    <span className="text-muted-foreground"> - {statusConfig.label}</span>
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                  {formatRelativeDay(task.updatedAt)}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("members.detail.noRecentActivity")}</p>
        </div>
      )}
    </div>
  )
}
