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
} from "lucide-react"
import Link from "next/link"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi, usersApi } from "@/lib/api"
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
import { getGreeting, pluralize } from "./helpers"

export function DispatcherDashboard() {
  const { user } = useAuth()

  // Fetch tasks
  const { data: tasksData } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => tasksApi.list(),
  })

  // Fetch workers
  const { data: workersData } = useQuery({
    queryKey: ["workers"],
    queryFn: () => usersApi.getWorkers(),
  })

  const tasks = tasksData?.data || []
  const workers = workersData || []

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
  const onlineWorkers = workers.length // In real app, would check last location timestamp

  // Task distribution for chart
  const chartData = [
    { name: "New", value: tasks.filter(t => t.status === "NEW").length, color: taskStatusColors.NEW },
    { name: "Assigned", value: tasks.filter(t => t.status === "ASSIGNED").length, color: taskStatusColors.ASSIGNED },
    { name: "In Progress", value: tasks.filter(t => t.status === "IN_PROGRESS").length, color: taskStatusColors.IN_PROGRESS },
    { name: "Completed", value: tasks.filter(t => t.status === "COMPLETED" || t.status === "CLOSED").length, color: taskStatusColors.COMPLETED },
    { name: "Blocked", value: tasks.filter(t => t.status === "BLOCKED").length, color: taskStatusColors.BLOCKED },
  ].filter(d => d.value > 0)

  // Team members
  const teamMembers: TeamMember[] = workers.map((w, idx) => ({
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
      label: "Live Map",
      description: "Track technicians",
      href: "/map",
      icon: Map,
    },
    {
      label: "All Tasks",
      description: "Manage all tasks",
      href: "/tasks",
      icon: ClipboardList,
    },
    {
      label: "Team",
      description: "Manage technicians",
      href: "/technicians",
      icon: Users,
    },
    {
      label: "Create Task",
      description: "Create a new task",
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
          <p className="text-[13px] font-medium text-slate-400">{greeting}</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Operations Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-medium text-slate-700">{activeTasks} active {pluralize(activeTasks, "task")}</span>
            {onlineWorkers > 0 && (
              <> · <span className="font-medium text-slate-700">{onlineWorkers} {pluralize(onlineWorkers, "technician")}</span></>
            )}
            {pendingAssignment > 0 && (
              <> · <span className="font-medium text-amber-600">{pendingAssignment} unassigned</span></>
            )}
          </p>
        </div>
        {pendingAssignment > 0 && (
          <Link
            href="/tasks?status=NEW"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            <UserCheck className="size-4" />
            Assign Tasks
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Tasks"
          value={activeTasks}
          icon={ClipboardList}
          trend="up"
          trendValue="Live"
        />
        <StatCard
          title="Technicians"
          value={onlineWorkers}
          icon={Users}
          description={`${workers.length} total`}
        />
        <StatCard
          title="Completed Today"
          value={completedToday}
          icon={CheckCircle2}
          trend={completedToday > 0 ? "up" : undefined}
          trendValue={completedToday > 0 ? `+${completedToday}` : undefined}
        />
        <StatCard
          title="Pending Assignment"
          value={pendingAssignment}
          icon={AlertTriangle}
          description="Needs attention"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Team Status */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900">Team Status</h2>
              <Link
                href="/technicians"
                className="text-[13px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Manage team
              </Link>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5">
              {teamMembers.length > 0 ? (
                <TeamStatus members={teamMembers} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="mb-3 size-8 text-slate-200" strokeWidth={1.5} />
                  <p className="text-sm text-slate-500">No technicians found</p>
                  <p className="text-[13px] text-slate-400 mt-1">Add team members to get started</p>
                </div>
              )}
            </div>
          </section>

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
        </div>

        {/* Right Column - 1/3 */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <QuickActions actions={quickActions} />
          </section>

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
              <ActivityFeed activities={activities} maxItems={5} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
