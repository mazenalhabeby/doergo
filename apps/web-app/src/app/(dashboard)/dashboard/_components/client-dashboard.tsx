"use client"

import { useQuery } from "@tanstack/react-query"
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  TrendingUp,
} from "lucide-react"
import Link from "next/link"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi } from "@/lib/api"
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

  // Fetch tasks
  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => tasksApi.list(),
  })

  const tasks = tasksData?.data || []

  // Calculate stats
  const totalTasks = tasks.length
  const inProgressTasks = tasks.filter(t => t.status === "IN_PROGRESS").length
  const completedTasks = tasks.filter(t => t.status === "COMPLETED" || t.status === "CLOSED").length
  const pendingTasks = tasks.filter(t => t.status === "NEW" || t.status === "ASSIGNED").length
  const blockedTasks = tasks.filter(t => t.status === "BLOCKED").length

  // Task distribution for chart
  const chartData = [
    { name: "New", value: tasks.filter(t => t.status === "NEW").length, color: taskStatusColors.NEW },
    { name: "Assigned", value: tasks.filter(t => t.status === "ASSIGNED").length, color: taskStatusColors.ASSIGNED },
    { name: "In Progress", value: inProgressTasks, color: taskStatusColors.IN_PROGRESS },
    { name: "Completed", value: completedTasks, color: taskStatusColors.COMPLETED },
    { name: "Blocked", value: blockedTasks, color: taskStatusColors.BLOCKED },
  ].filter(d => d.value > 0)

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

  // Mock activity for now (would come from real-time events)
  const activities: ActivityItem[] = tasks.slice(0, 4).map(t => ({
    id: t.id,
    type: t.status === "COMPLETED" ? "task_completed" : t.status === "IN_PROGRESS" ? "task_started" : "task_created",
    title: t.title,
    description: `Status: ${t.status.replace("_", " ")}`,
    timestamp: new Date(t.updatedAt || t.createdAt),
    user: t.assignedTo ? { name: `${t.assignedTo.firstName} ${t.assignedTo.lastName}` } : undefined,
  }))

  // Quick actions for CLIENT
  const quickActions = [
    {
      label: "Create Task",
      description: "Submit a new service request",
      href: "/tasks/new",
      icon: Plus,
    },
    {
      label: "View All Tasks",
      description: "See all your tasks",
      href: "/tasks",
      icon: ClipboardList,
    },
  ]

  const greeting = getGreeting()

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-slate-400">{greeting}</p>
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome back, {user?.firstName}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {pendingTasks > 0 || inProgressTasks > 0 ? (
            <>
              You have {pendingTasks > 0 && <span className="font-medium text-slate-700">{pendingTasks} {pluralize(pendingTasks, "task")} pending</span>}
              {pendingTasks > 0 && inProgressTasks > 0 && " and "}
              {inProgressTasks > 0 && <span className="font-medium text-slate-700">{inProgressTasks} in progress</span>}
            </>
          ) : (
            "All caught up!"
          )}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Tasks"
          value={totalTasks}
          icon={ClipboardList}
          description="All time"
        />
        <StatCard
          title="In Progress"
          value={inProgressTasks}
          icon={Clock}
          trend={inProgressTasks > 0 ? "up" : undefined}
          trendValue="Active"
        />
        <StatCard
          title="Completed"
          value={completedTasks}
          icon={CheckCircle2}
          trend="up"
          trendValue={`${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%`}
        />
        <StatCard
          title="Pending"
          value={pendingTasks}
          icon={AlertTriangle}
          description="Awaiting action"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Tasks */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900">Recent Tasks</h2>
              <Link
                href="/tasks"
                className="text-[13px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                View all
              </Link>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-2">
              <RecentTasks tasks={recentTasks} showViewAll={false} />
            </div>
          </section>

          {/* Quick Actions */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <QuickActions actions={quickActions} />
          </section>
        </div>

        {/* Right Column - 1/3 */}
        <div className="space-y-6">
          {/* Task Distribution Chart */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Distribution</h2>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-6">
              {chartData.length > 0 ? (
                <TaskChart data={chartData} />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <TrendingUp className="mb-2 size-8 text-slate-200" strokeWidth={1.5} />
                  <p className="text-sm text-slate-400">No data yet</p>
                </div>
              )}
            </div>
          </section>

          {/* Activity Feed */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Recent Activity</h2>
            <div className="rounded-2xl border border-slate-200/60 bg-white px-5">
              <ActivityFeed activities={activities} maxItems={4} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
