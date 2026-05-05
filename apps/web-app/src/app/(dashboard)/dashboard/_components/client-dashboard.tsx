"use client"

import { useMemo, useState } from "react"
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
  LayoutGrid,
  List,
} from "lucide-react"
import Link from "next/link"
import { format, differenceInCalendarDays, parseISO } from "date-fns"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi, techniciansApi } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  StatCard,
  ActivityFeed,
  TaskChart,
  QuickActions,
  RecentTasks,
  WorkspaceGrid,
  taskStatusColors,
  type ActivityItem,
  type RecentTask,
  type WorkspaceBoxProps,
  type PersonNodeProps,
  type WorkerStatus,
} from "@/components/dashboard"
import { getGreeting, pluralize } from "./helpers"

// Gradient colors for worker avatars
const AVATAR_COLORS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #3b82f6, #06b6d4)",
  "linear-gradient(135deg, #10b981, #059669)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #ef4444, #dc2626)",
  "linear-gradient(135deg, #ec4899, #db2777)",
  "linear-gradient(135deg, #8b5cf6, #a855f7)",
  "linear-gradient(135deg, #14b8a6, #0d9488)",
]

function getInitials(firstName?: string, lastName?: string): string {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase()
}

function getStatusFromTask(taskStatus: string): WorkerStatus {
  switch (taskStatus) {
    case "IN_PROGRESS":
    case "EN_ROUTE":
    case "ARRIVED":
      return "busy"
    case "BLOCKED":
      return "late"
    default:
      return "on"
  }
}

function getTagFromTask(taskStatus: string): PersonNodeProps["tag"] {
  switch (taskStatus) {
    case "IN_PROGRESS":
      return { text: "Working", variant: "task" }
    case "EN_ROUTE":
      return { text: "En Route", variant: "task" }
    case "ARRIVED":
      return { text: "On Site", variant: "task" }
    case "BLOCKED":
      return { text: "Blocked", variant: "miss" }
    default:
      return undefined
  }
}

export function ClientDashboard() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<"spatial" | "classic">("spatial")

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

  // Build workspace boxes from task data
  const workspaceBoxes: WorkspaceBoxProps[] = useMemo(() => {
    // Group tasks by location address (or "Unassigned" if none)
    const locationGroups = new Map<string, typeof tasks>()

    for (const task of tasks) {
      const loc = task.locationAddress || "Unassigned"
      if (!locationGroups.has(loc)) {
        locationGroups.set(loc, [])
      }
      locationGroups.get(loc)!.push(task)
    }

    // Also group by status for workspace context
    const activeTasks = tasks.filter(t =>
      ["IN_PROGRESS", "EN_ROUTE", "ARRIVED", "BLOCKED"].includes(t.status)
    )
    const pendingTasksList = tasks.filter(t =>
      ["NEW", "ASSIGNED", "ACCEPTED"].includes(t.status)
    )
    const completedTasksList = tasks.filter(t =>
      ["COMPLETED", "CLOSED"].includes(t.status)
    )

    // Build person nodes for active workers
    const activeWorkerMap = new Map<string, PersonNodeProps>()
    for (const task of activeTasks) {
      if (task.assignedTo && !activeWorkerMap.has(task.assignedTo.id)) {
        const colorIdx = task.assignedTo.id.charCodeAt(0) % AVATAR_COLORS.length
        activeWorkerMap.set(task.assignedTo.id, {
          initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
          color: AVATAR_COLORS[colorIdx]!,
          status: getStatusFromTask(task.status),
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
          tag: getTagFromTask(task.status),
        })
      }
    }

    const pendingWorkerMap = new Map<string, PersonNodeProps>()
    for (const task of pendingTasksList) {
      if (task.assignedTo && !pendingWorkerMap.has(task.assignedTo.id) && !activeWorkerMap.has(task.assignedTo.id)) {
        const colorIdx = task.assignedTo.id.charCodeAt(0) % AVATAR_COLORS.length
        pendingWorkerMap.set(task.assignedTo.id, {
          initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
          color: AVATAR_COLORS[colorIdx]!,
          status: "on" as WorkerStatus,
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
          tag: { text: `${tasks.filter(t => t.assignedToId === task.assignedTo?.id && ["NEW", "ASSIGNED", "ACCEPTED"].includes(t.status)).length} pending`, variant: "hrs" },
        })
      }
    }

    const boxes: WorkspaceBoxProps[] = []

    if (activeWorkerMap.size > 0) {
      boxes.push({
        title: "Active Now",
        icon: "\u{1F525}",
        count: activeWorkerMap.size,
        type: "fixed",
        people: Array.from(activeWorkerMap.values()),
      })
    }

    if (pendingWorkerMap.size > 0) {
      boxes.push({
        title: "Pending Tasks",
        icon: "\u{1F4CB}",
        count: pendingWorkerMap.size,
        type: "fixed",
        people: Array.from(pendingWorkerMap.values()),
      })
    }

    // Add location-based boxes for active tasks
    for (const [location, locTasks] of locationGroups) {
      const activeLocTasks = locTasks.filter(t =>
        ["IN_PROGRESS", "EN_ROUTE", "ARRIVED"].includes(t.status)
      )
      if (activeLocTasks.length === 0) continue

      const people: PersonNodeProps[] = []
      const seenIds = new Set<string>()
      for (const task of activeLocTasks) {
        if (task.assignedTo && !seenIds.has(task.assignedTo.id)) {
          seenIds.add(task.assignedTo.id)
          const colorIdx = task.assignedTo.id.charCodeAt(0) % AVATAR_COLORS.length
          people.push({
            initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
            color: AVATAR_COLORS[colorIdx]!,
            status: getStatusFromTask(task.status),
            name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
            tag: getTagFromTask(task.status),
          })
        }
      }

      if (people.length > 0) {
        // Shorten location name
        const shortLoc = location.length > 20
          ? location.split(",")[0] || location.slice(0, 20)
          : location
        boxes.push({
          title: shortLoc,
          icon: "\u{1F4CD}",
          count: people.length,
          type: "dynamic",
          people,
        })
      }
    }

    // Add "Completed Today" box
    const completedPeople: PersonNodeProps[] = []
    const completedIds = new Set<string>()
    for (const task of completedTasksList) {
      if (task.assignedTo && !completedIds.has(task.assignedTo.id)) {
        completedIds.add(task.assignedTo.id)
        const colorIdx = task.assignedTo.id.charCodeAt(0) % AVATAR_COLORS.length
        completedPeople.push({
          initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
          color: AVATAR_COLORS[colorIdx]!,
          status: "off" as WorkerStatus,
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
        })
      }
    }
    boxes.push({
      title: "Completed",
      icon: "\u{2705}",
      count: completedPeople.length,
      type: "fixed",
      people: completedPeople,
    })

    return boxes
  }, [tasks])

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
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
            <h1 className="text-2xl font-semibold text-foreground">
              {t("dashboard.admin.welcomeBack", { name: user?.firstName })}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {pendingTasks > 0 || inProgressTasks > 0 ? (
                <>
                  {pendingTasks > 0 && <span className="font-medium text-foreground/80">{t("dashboard.admin.tasksPending", { count: pendingTasks, taskWord: pluralize(pendingTasks, "task") })}</span>}
                  {pendingTasks > 0 && inProgressTasks > 0 && ` ${t("common.and")} `}
                  {inProgressTasks > 0 && <span className="font-medium text-foreground/80">{t("dashboard.admin.tasksInProgress", { count: inProgressTasks })}</span>}
                </>
              ) : (
                t("dashboard.admin.allCaughtUp")
              )}
            </p>
          </div>
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <Button
              variant={viewMode === "spatial" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("spatial")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "classic" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("classic")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === "spatial" ? (
        /* ─── Spatial View ─── */
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main workspace grid */}
          <div className="space-y-6">
            {/* Stats row (compact) */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
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

            {/* Workspace Grid */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-4">Workspace</h2>
              <WorkspaceGrid boxes={workspaceBoxes} />
            </section>

            {/* Quick Actions */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.admin.quickActions")}</h2>
              <QuickActions actions={quickActions} />
            </section>
          </div>

          {/* Right sidebar panel */}
          <div className="space-y-6">
            {/* Task Distribution Chart */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.admin.distribution")}</h2>
              <div className="rounded-2xl border border-border bg-card p-6">
                {chartData.length > 0 ? (
                  <TaskChart data={chartData} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <TrendingUp className="mb-2 size-8 text-muted-foreground/30" strokeWidth={1.5} />
                    <p className="text-sm text-muted-foreground">{t("dashboard.admin.noDataYet")}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Pending Time Off */}
            {pendingTimeOff.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-foreground">{t("dashboard.admin.timeOffRequests")}</h2>
                  <Link
                    href="/technicians/availability?tab=time-off"
                    className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("dashboard.admin.viewAll")}
                  </Link>
                </div>
                <div className="rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-1">
                    <Umbrella className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {t("dashboard.admin.pendingRequests", { count: pendingTimeOff.length, plural: pendingTimeOff.length !== 1 ? "s" : "" })}
                    </span>
                  </div>
                  {pendingTimeOff.slice(0, 3).map((req: any) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between rounded-lg bg-card p-3 border border-border"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground shrink-0">
                          {req.technician?.firstName?.[0]}{req.technician?.lastName?.[0]}
                        </div>
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
                      <Badge className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[11px] shrink-0">{t("common.pending")}</Badge>
                    </div>
                  ))}
                  {pendingTimeOff.length > 3 && (
                    <Link
                      href="/technicians/availability?tab=time-off"
                      className="flex items-center justify-center gap-1 text-[13px] font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 pt-1"
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
              <h2 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.admin.recentActivity")}</h2>
              <div className="rounded-2xl border border-border bg-card px-5">
                <ActivityFeed activities={activities} maxItems={4} />
              </div>
            </section>
          </div>
        </div>
      ) : (
        /* ─── Classic View ─── */
        <>
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
                  <h2 className="text-sm font-semibold text-foreground">{t("dashboard.admin.recentTasks")}</h2>
                  <Link
                    href="/tasks"
                    className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("dashboard.admin.viewAll")}
                  </Link>
                </div>
                <div className="rounded-2xl border border-border bg-card p-2">
                  <RecentTasks tasks={recentTasks} showViewAll={false} />
                </div>
              </section>

              {/* Quick Actions */}
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.admin.quickActions")}</h2>
                <QuickActions actions={quickActions} />
              </section>
            </div>

            {/* Right Column - 1/3 */}
            <div className="space-y-6">
              {/* Task Distribution Chart */}
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.admin.distribution")}</h2>
                <div className="rounded-2xl border border-border bg-card p-6">
                  {chartData.length > 0 ? (
                    <TaskChart data={chartData} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <TrendingUp className="mb-2 size-8 text-muted-foreground/30" strokeWidth={1.5} />
                      <p className="text-sm text-muted-foreground">{t("dashboard.admin.noDataYet")}</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Pending Time Off */}
              {pendingTimeOff.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-foreground">{t("dashboard.admin.timeOffRequests")}</h2>
                    <Link
                      href="/technicians/availability?tab=time-off"
                      className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t("dashboard.admin.viewAll")}
                    </Link>
                  </div>
                  <div className="rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-1">
                      <Umbrella className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {t("dashboard.admin.pendingRequests", { count: pendingTimeOff.length, plural: pendingTimeOff.length !== 1 ? "s" : "" })}
                      </span>
                    </div>
                    {pendingTimeOff.slice(0, 3).map((req: any) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between rounded-lg bg-card p-3 border border-border"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground shrink-0">
                            {req.technician?.firstName?.[0]}{req.technician?.lastName?.[0]}
                          </div>
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
                        <Badge className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[11px] shrink-0">{t("common.pending")}</Badge>
                      </div>
                    ))}
                    {pendingTimeOff.length > 3 && (
                      <Link
                        href="/technicians/availability?tab=time-off"
                        className="flex items-center justify-center gap-1 text-[13px] font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 pt-1"
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
                <h2 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.admin.recentActivity")}</h2>
                <div className="rounded-2xl border border-border bg-card px-5">
                  <ActivityFeed activities={activities} maxItems={4} />
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
