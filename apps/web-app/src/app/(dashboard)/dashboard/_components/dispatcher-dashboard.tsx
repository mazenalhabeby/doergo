"use client"

import { useQuery } from "@tanstack/react-query"
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Users,
  UserCheck,
  Plus,
  Map,
  TrendingUp,
  Umbrella,
  CalendarDays,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { format, differenceInCalendarDays, parseISO } from "date-fns"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/contexts/auth-context"
import { UserAvatar } from "@/components/user-avatar"
import { tasksApi, usersApi, employeesApi, type TimeOffRequest } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import {
  StatCard,
  ActivityFeed,
  TaskChart,
  TeamStatus,
  QuickActions,
  RecentTasks,
  taskStatusColors,
  type ActivityItem,
  type TeamMember,
  type RecentTask,
} from "@/components/dashboard"
import { getGreeting } from "./helpers"

export function DispatcherDashboard() {
  const { user } = useAuth()
  const { t } = useTranslation()

  // Fetch tasks
  const { data: tasksData } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => tasksApi.list(),
  })

  // Fetch employees
  const { data: employeesData } = useQuery({
    queryKey: ["workers"],
    queryFn: () => usersApi.getWorkers(),
  })

  // Fetch pending time-off requests
  const { data: pendingTimeOff = [] } = useQuery({
    queryKey: ["orgTimeOff", "PENDING"],
    queryFn: () => employeesApi.getOrgTimeOff("PENDING"),
  })

  const tasks = tasksData?.data || []
  const employees = employeesData || []

  // Calculate stats
  const activeTasks = tasks.filter(t =>
    ["NEW", "ASSIGNED", "IN_PROGRESS", "BLOCKED"].includes(t.status)
  ).length
  const completedToday = tasks.filter(t => {
    if (t.status !== "COMPLETED") return false
    const updated = new Date(t.updatedAt || t.createdAt)
    const today = new Date()
    return updated.toDateString() === today.toDateString()
  }).length
  const pendingAssignment = tasks.filter(t => t.status === "NEW").length
  const onlineEmployees = employees.length // In real app, would check last location timestamp

  // Task distribution for chart
  const chartData = [
    { name: "New", value: tasks.filter(t => t.status === "NEW").length, color: taskStatusColors.NEW },
    { name: "Assigned", value: tasks.filter(t => t.status === "ASSIGNED").length, color: taskStatusColors.ASSIGNED },
    { name: "In Progress", value: tasks.filter(t => t.status === "IN_PROGRESS").length, color: taskStatusColors.IN_PROGRESS },
    { name: "Completed", value: tasks.filter(t => t.status === "COMPLETED" || t.status === "CLOSED").length, color: taskStatusColors.COMPLETED },
    { name: "Blocked", value: tasks.filter(t => t.status === "BLOCKED").length, color: taskStatusColors.BLOCKED },
  ].filter(d => d.value > 0)

  // Team members
  const teamMembers: TeamMember[] = employees.map((w, idx) => ({
    id: w.id,
    name: `${w.firstName} ${w.lastName}`,
    status: idx === 0 ? "busy" : idx === 1 ? "online" : "offline",
    currentTask: tasks.find(t => t.assignedToId === w.id && t.status === "IN_PROGRESS")?.title,
    completedToday: tasks.filter(t => t.assignedToId === w.id && t.status === "COMPLETED").length,
    location: "New York, NY",
  }))

  // Recent tasks
  const recentTasks: RecentTask[] = tasks.slice(0, 5).map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
    location: t.locationAddress || undefined,
    assignee: t.assignedTo ? { name: `${t.assignedTo.firstName} ${t.assignedTo.lastName}` } : undefined,
    createdAt: new Date(t.createdAt),
  }))

  // Activity feed
  const activities: ActivityItem[] = tasks.slice(0, 5).map(t => ({
    id: t.id,
    type: t.status === "COMPLETED" ? "task_completed" :
          t.status === "IN_PROGRESS" ? "task_started" :
          t.assignedToId ? "task_assigned" : "task_created",
    title: t.title,
    description: t.assignedTo
      ? `Assigned to ${t.assignedTo.firstName} ${t.assignedTo.lastName}`
      : `Status: ${t.status.replace("_", " ")}`,
    timestamp: new Date(t.updatedAt || t.createdAt),
    user: t.createdBy ? { name: `${t.createdBy.firstName} ${t.createdBy.lastName}` } : undefined,
  }))

  // Quick actions for DISPATCHER
  const quickActions = [
    {
      label: t("dashboard.dispatcher.allTasks"),
      description: t("dashboard.dispatcher.manageAllTasks"),
      href: "/tasks",
      icon: ClipboardList,
    },
    {
      label: t("dashboard.dispatcher.team"),
      description: t("dashboard.dispatcher.manageEmployees"),
      href: "/employees",
      icon: Users,
    },
    {
      label: t("dashboard.dispatcher.createTask"),
      description: t("dashboard.dispatcher.createANewTask"),
      href: "/tasks/new",
      icon: Plus,
    },
  ]

  const greeting = getGreeting()

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("dashboard.dispatcher.operationsDashboard")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{activeTasks} {t("dashboard.dispatcher.activeTasks").toLowerCase()}</span>
            {onlineEmployees > 0 && (
              <> · <span className="font-medium text-foreground">{t("dashboard.dispatcher.total", { count: onlineEmployees })} {t("dashboard.dispatcher.employees").toLowerCase()}</span></>
            )}
            {pendingAssignment > 0 && (
              <> · <span className="font-medium text-amber-600">{t("dashboard.dispatcher.unassigned", { count: pendingAssignment })}</span></>
            )}
          </p>
        </div>
        {pendingAssignment > 0 && (
          <Link
            href="/tasks?status=NEW"
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
          >
            <UserCheck className="size-4" />
            {t("dashboard.dispatcher.assignTasks")}
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("dashboard.dispatcher.activeTasks")}
          value={activeTasks}
          icon={ClipboardList}
          trend="up"
          trendValue={t("dashboard.dispatcher.live")}
        />
        <StatCard
          title={t("dashboard.dispatcher.employees")}
          value={onlineEmployees}
          icon={Users}
          description={t("dashboard.dispatcher.total", { count: employees.length })}
        />
        <StatCard
          title={t("dashboard.dispatcher.completedToday")}
          value={completedToday}
          icon={CheckCircle2}
          trend={completedToday > 0 ? "up" : undefined}
          trendValue={completedToday > 0 ? `+${completedToday}` : undefined}
        />
        <StatCard
          title={t("dashboard.dispatcher.pendingAssignment")}
          value={pendingAssignment}
          icon={AlertTriangle}
          description={t("dashboard.dispatcher.needsAttention")}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Team Status */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">{t("dashboard.dispatcher.teamStatus")}</h2>
              <Link
                href="/employees"
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("dashboard.dispatcher.manageTeam")}
              </Link>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              {teamMembers.length > 0 ? (
                <TeamStatus members={teamMembers} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="mb-3 size-8 text-muted-foreground" strokeWidth={1.5} />
                  <p className="text-sm text-muted-foreground">{t("dashboard.dispatcher.noEmployeesFound")}</p>
                  <p className="text-[13px] text-muted-foreground mt-1">{t("dashboard.dispatcher.addTeamMembersToGetStarted")}</p>
                </div>
              )}
            </div>
          </section>

          {/* Recent Tasks */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">{t("dashboard.dispatcher.recentTasks")}</h2>
              <Link
                href="/tasks"
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("dashboard.dispatcher.viewAll")}
              </Link>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-2">
              <RecentTasks tasks={recentTasks} showViewAll={false} />
            </div>
          </section>
        </div>

        {/* Right Column - 1/3 */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.dispatcher.quickActions")}</h2>
            <QuickActions actions={quickActions} />
          </section>

          {/* Task Distribution Chart */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.dispatcher.distribution")}</h2>
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              {chartData.length > 0 ? (
                <TaskChart data={chartData} />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <TrendingUp className="mb-2 size-8 text-muted-foreground" strokeWidth={1.5} />
                  <p className="text-sm text-muted-foreground">{t("dashboard.dispatcher.noDataYet")}</p>
                </div>
              )}
            </div>
          </section>

          {/* Pending Time Off */}
          {pendingTimeOff.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">{t("dashboard.dispatcher.timeOffRequests")}</h2>
                <Link
                  href="/employees/availability?tab=time-off"
                  className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("dashboard.dispatcher.viewAll")}
                </Link>
              </div>
              <div className="rounded-2xl border border-amber-200/60 bg-amber-50/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-700 mb-1">
                  <Umbrella className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {t("dashboard.dispatcher.pendingRequests", { count: pendingTimeOff.length, plural: pendingTimeOff.length !== 1 ? "s" : "" })}
                  </span>
                </div>
                {pendingTimeOff.slice(0, 3).map((req: any) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg bg-card p-3 border border-border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        firstName={req.technician?.firstName}
                        lastName={req.technician?.lastName}
                        avatarUrl={req.technician?.avatarUrl}
                        seed={req.technician?.id}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {req.technician?.firstName} {req.technician?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(req.startDate), "MMM d")}
                          {req.startDate !== req.endDate && <> &ndash; {format(parseISO(req.endDate), "MMM d")}</>}
                          {" "}({differenceInCalendarDays(parseISO(req.endDate), parseISO(req.startDate)) + 1}d)
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] shrink-0">{t("common.pending")}</Badge>
                  </div>
                ))}
                {pendingTimeOff.length > 3 && (
                  <Link
                    href="/employees/availability?tab=time-off"
                    className="flex items-center justify-center gap-1 text-[13px] font-medium text-amber-700 hover:text-amber-800 pt-1"
                  >
                    {t("dashboard.dispatcher.more", { count: pendingTimeOff.length - 3 })}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* Activity Feed */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.dispatcher.recentActivity")}</h2>
            <div className="rounded-2xl border border-border/60 bg-card px-5">
              <ActivityFeed activities={activities} maxItems={5} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
