"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  TrendingUp,
  Umbrella,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { format, differenceInCalendarDays, parseISO } from "date-fns"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi, techniciansApi } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import {
  StatCard,
  ActivityFeed,
  TaskChart,
  QuickActions,
  RecentTasks,
  taskStatusColors,
  type ActivityItem,
  type RecentTask,
} from "@/components/dashboard"
import { getGreeting, pluralize } from "./helpers"

export function ClientDashboard() {
  const { user } = useAuth()
  const { t } = useTranslation()

  // Fetch tasks
  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => tasksApi.list(),
  })

  // Fetch pending time-off requests
  const { data: pendingTimeOff = [] } = useQuery({
    queryKey: ["orgTimeOff", "PENDING"],
    queryFn: () => techniciansApi.getOrgTimeOff("PENDING"),
  })

  const tasks = tasksData?.data || []

  // Calculate stats (memoized to avoid re-filtering on every render)
  const { totalTasks, inProgressTasks, completedTasks, pendingTasks, blockedTasks } = useMemo(() => ({
    totalTasks: tasks.length,
    inProgressTasks: tasks.filter(t => t.status === "IN_PROGRESS").length,
    completedTasks: tasks.filter(t => t.status === "COMPLETED" || t.status === "CLOSED").length,
    pendingTasks: tasks.filter(t => t.status === "NEW" || t.status === "ASSIGNED").length,
    blockedTasks: tasks.filter(t => t.status === "BLOCKED").length,
  }), [tasks])

  // Task distribution for chart
  const chartData = useMemo(() => [
    { name: "New", value: tasks.filter(t => t.status === "NEW").length, color: taskStatusColors.NEW },
    { name: "Assigned", value: tasks.filter(t => t.status === "ASSIGNED").length, color: taskStatusColors.ASSIGNED },
    { name: "In Progress", value: inProgressTasks, color: taskStatusColors.IN_PROGRESS },
    { name: "Completed", value: completedTasks, color: taskStatusColors.COMPLETED },
    { name: "Blocked", value: blockedTasks, color: taskStatusColors.BLOCKED },
  ].filter(d => d.value > 0), [tasks, inProgressTasks, completedTasks, blockedTasks])

  // Recent tasks
  const recentTasks: RecentTask[] = useMemo(() => tasks.slice(0, 5).map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
    location: t.locationAddress || undefined,
    assignee: t.assignedTo ? { name: `${t.assignedTo.firstName} ${t.assignedTo.lastName}` } : undefined,
    createdAt: new Date(t.createdAt),
  })), [tasks])

  // Activity derived from tasks
  const activities: ActivityItem[] = useMemo(() => tasks.slice(0, 4).map(t => ({
    id: t.id,
    type: t.status === "COMPLETED" ? "task_completed" : t.status === "IN_PROGRESS" ? "task_started" : "task_created",
    title: t.title,
    description: `Status: ${t.status.replace("_", " ")}`,
    timestamp: new Date(t.updatedAt || t.createdAt),
    user: t.assignedTo ? { name: `${t.assignedTo.firstName} ${t.assignedTo.lastName}` } : undefined,
  })), [tasks])

  // Quick actions (static)
  const quickActions = useMemo(() => [
    {
      label: t("dashboard.admin.createTask"),
      description: t("dashboard.admin.submitNewServiceRequest"),
      href: "/tasks/new",
      icon: Plus,
    },
    {
      label: t("dashboard.admin.viewAllTasks"),
      description: t("dashboard.admin.seeAllYourTasks"),
      href: "/tasks",
      icon: ClipboardList,
    },
  ], [t])

  const greeting = getGreeting()

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-slate-400">{greeting}</p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("dashboard.admin.welcomeBack", { name: user?.firstName })}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {pendingTasks > 0 || inProgressTasks > 0 ? (
            <>
              {pendingTasks > 0 && <span className="font-medium text-slate-700">{t("dashboard.admin.tasksPending", { count: pendingTasks, taskWord: pluralize(pendingTasks, "task") })}</span>}
              {pendingTasks > 0 && inProgressTasks > 0 && ` ${t("common.and")} `}
              {inProgressTasks > 0 && <span className="font-medium text-slate-700">{t("dashboard.admin.tasksInProgress", { count: inProgressTasks })}</span>}
            </>
          ) : (
            t("dashboard.admin.allCaughtUp")
          )}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("dashboard.admin.totalTasks")}
          value={totalTasks}
          icon={ClipboardList}
          description={t("dashboard.admin.allTime")}
        />
        <StatCard
          title={t("dashboard.admin.inProgress")}
          value={inProgressTasks}
          icon={Clock}
          trend={inProgressTasks > 0 ? "up" : undefined}
          trendValue={t("common.active")}
        />
        <StatCard
          title={t("dashboard.admin.completed")}
          value={completedTasks}
          icon={CheckCircle2}
          trend="up"
          trendValue={`${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%`}
        />
        <StatCard
          title={t("dashboard.admin.pendingLabel")}
          value={pendingTasks}
          icon={AlertTriangle}
          description={t("dashboard.admin.awaitingAction")}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Tasks */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900">{t("dashboard.admin.recentTasks")}</h2>
              <Link
                href="/tasks"
                className="text-[13px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                {t("dashboard.admin.viewAll")}
              </Link>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-2">
              <RecentTasks tasks={recentTasks} showViewAll={false} />
            </div>
          </section>

          {/* Quick Actions */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-4">{t("dashboard.admin.quickActions")}</h2>
            <QuickActions actions={quickActions} />
          </section>
        </div>

        {/* Right Column - 1/3 */}
        <div className="space-y-6">
          {/* Task Distribution Chart */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-4">{t("dashboard.admin.distribution")}</h2>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-6">
              {chartData.length > 0 ? (
                <TaskChart data={chartData} />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <TrendingUp className="mb-2 size-8 text-slate-200" strokeWidth={1.5} />
                  <p className="text-sm text-slate-400">{t("dashboard.admin.noDataYet")}</p>
                </div>
              )}
            </div>
          </section>

          {/* Pending Time Off */}
          {pendingTimeOff.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">{t("dashboard.admin.timeOffRequests")}</h2>
                <Link
                  href="/technicians/availability?tab=time-off"
                  className="text-[13px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  {t("dashboard.admin.viewAll")}
                </Link>
              </div>
              <div className="rounded-2xl border border-amber-200/60 bg-amber-50/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-700 mb-1">
                  <Umbrella className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {t("dashboard.admin.pendingRequests", { count: pendingTimeOff.length, plural: pendingTimeOff.length !== 1 ? "s" : "" })}
                  </span>
                </div>
                {pendingTimeOff.slice(0, 3).map((req: any) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg bg-white p-3 border border-slate-100"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-medium text-slate-600 shrink-0">
                        {req.technician?.firstName?.[0]}{req.technician?.lastName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {req.technician?.firstName} {req.technician?.lastName}
                        </p>
                        <p className="text-xs text-slate-400">
                          {format(parseISO(req.startDate), "MMM d")}
                          {req.startDate !== req.endDate && <> &ndash; {format(parseISO(req.endDate), "MMM d")}</>}
                          {" "}({differenceInCalendarDays(parseISO(req.endDate), parseISO(req.startDate)) + 1}d)
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700 text-[11px] shrink-0">{t("common.pending")}</Badge>
                  </div>
                ))}
                {pendingTimeOff.length > 3 && (
                  <Link
                    href="/technicians/availability?tab=time-off"
                    className="flex items-center justify-center gap-1 text-[13px] font-medium text-amber-700 hover:text-amber-800 pt-1"
                  >
                    {t("dashboard.admin.more", { count: pendingTimeOff.length - 3 })}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* Activity Feed */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-4">{t("dashboard.admin.recentActivity")}</h2>
            <div className="rounded-2xl border border-slate-200/60 bg-white px-5">
              <ActivityFeed activities={activities} maxItems={4} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
