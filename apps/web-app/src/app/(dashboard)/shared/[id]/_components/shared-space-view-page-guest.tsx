"use client"

import { personName } from "@hbcfield/shared/client"
import { ClipboardList } from "lucide-react"
import { PriorityBadge } from "@/components/tasks/priority-badge"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { dateLocale } from "@/lib/format-date"
import type { SharedSpaceViewPageState } from "../_hooks/use-shared-space-view-page"

/** Part of SharedSpaceViewPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function SharedSpaceViewPageGuest({ vm }: { vm: SharedSpaceViewPageState }) {
  const {
    t,
    isLoading,
    tasks,
    canAssign,
    workers,
    assignMutation,
    share,
  } = vm
  if ((!share)) return null
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.tasksHeading")}</h2>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ClipboardList className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm font-semibold text-foreground">{t("spaceSharing.guest.noTasks")}</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{task.title}</p>
                  {task.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[11px] font-medium border-border bg-muted text-muted-foreground">
                      {task.status?.replace(/_/g, " ")}
                    </Badge>
                    {task.priority && (
                      <PriorityBadge priority={task.priority} showIcon={false} className="text-[11px] font-medium" />
                    )}
                    {task.assignedTo && (
                      <span className="text-[11px] text-muted-foreground">
                        {personName(task.assignedTo)}
                      </span>
                    )}
                  </div>
                </div>
                {task.dueDate && (
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(task.dueDate).toLocaleDateString(dateLocale(), { day: "2-digit", month: "short" })}
                  </span>
                )}
              </div>
              {/* CONTROL guests can assign the owner's workers directly. */}
              {canAssign && workers && workers.length > 0 && (
                <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-2.5">
                  <span className="text-[11px] text-muted-foreground">{t("spaceSharing.guest.assignTo", "Assign to")}</span>
                  <Select
                    value={task.assignedTo?.id || ""}
                    onValueChange={(v) => assignMutation.mutate({ taskId: task.id, workerId: v })}
                  >
                    <SelectTrigger className="h-7 w-[190px] text-xs">
                      <SelectValue placeholder={t("spaceSharing.guest.unassigned", "Unassigned")} />
                    </SelectTrigger>
                    <SelectContent>
                      {/* An assignment with no user attached cannot be
                          picked — a Select option whose value is undefined
                          renders but silently refuses to select. */}
                      {workers.filter((w) => w.user?.id).map((w) => (
                        <SelectItem key={w.user!.id} value={w.user!.id}>
                          {personName(w.user)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
