"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { type OrgMember, type ScheduleEntry, type Task } from "@/lib/api"
import { getStatusConfig } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { useTimeFormat } from "@/hooks"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDayMonth, formatRelativeDay } from "@/lib/format-date"

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

interface MemberOverviewProps {
  member: OrgMember
  memberId: string
  /** The member's five latest tasks. */
  tasks: Task[]
  tasksLoading: boolean
  schedule: ScheduleEntry[]
  scheduleLoading: boolean
}

/** The member page's Overview: recent tasks beside the week's hours (fixed hours) or the activity. */
export function MemberOverview({
  member,
  memberId,
  tasks,
  tasksLoading,
  schedule,
  scheduleLoading,
}: MemberOverviewProps) {
  // Schedule box is dynamic: only shows for a FIXED member that actually
  // has hours set. Flexible / none / empty → the box disappears entirely.
  const showSchedule = member.scheduleType === "FIXED" && (scheduleLoading || schedule.length > 0)

  const activityCard = <MemberActivity tasks={tasks} tasksLoading={tasksLoading} />

  return (
    <div className="space-y-6">
      <div data-tour="member-tasks" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Recent Tasks ─────────────────────────────────────────── */}
        <MemberRecentTasks memberId={memberId} tasks={tasks} tasksLoading={tasksLoading} />

        {/* ── Right column: Schedule if the member has fixed hours, else Activity ── */}
        {showSchedule ? <MemberWeekHours schedule={schedule} scheduleLoading={scheduleLoading} /> : activityCard}
      </div>

      {/* Activity drops to a full-width row only when Schedule took the slot */}
      {showSchedule && activityCard}
    </div>
  )
}

/** The member's five latest tasks, each opening the task, and the way to all of them. */
function MemberRecentTasks({
  memberId,
  tasks,
  tasksLoading,
}: {
  memberId: string
  tasks: Task[]
  tasksLoading: boolean
}) {
  const { t } = useTranslation()
  const router = useRouter()
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
                    style={{
                      borderColor: `${statusConfig.hex}33`,
                      color: statusConfig.hex,
                      backgroundColor: `${statusConfig.hex}14`,
                    }}
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

/** A fixed-hours member's week: each day's hours, or "off". */
function MemberWeekHours({ schedule, scheduleLoading }: { schedule: ScheduleEntry[]; scheduleLoading: boolean }) {
  const { t } = useTranslation()
  const { formatSchedule } = useTimeFormat()
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border/60">
        <h2 className="text-sm font-semibold text-foreground">{t("members.detail.schedule")}</h2>
      </div>
      {scheduleLoading ? (
        <div className="p-5 space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {DAY_KEYS.map((dayKey, i) => {
            const entry = schedule.find((s: ScheduleEntry) => s.dayOfWeek === i)
            const isActive = entry?.isActive
            return (
              <div key={i} className={cn("flex items-center justify-between px-5 py-2.5", !isActive && "opacity-40")}>
                <span className="text-sm font-medium text-foreground w-10">{t(`common.weekdaysShort.${dayKey}`)}</span>
                <span className="text-sm text-muted-foreground">
                  {isActive
                    ? `${formatSchedule(entry!.startTime)} - ${formatSchedule(entry!.endTime)}`
                    : t("members.detail.off")}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** What last happened on the member's tasks. */
function MemberActivity({ tasks, tasksLoading }: { tasks: Task[]; tasksLoading: boolean }) {
  const { t } = useTranslation()
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
