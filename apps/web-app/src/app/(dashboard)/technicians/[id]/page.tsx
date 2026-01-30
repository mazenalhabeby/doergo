"use client"

import { useState, useMemo } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Star,
  MapPin,
  Clock,
  ClipboardList,
  Calendar,
  BarChart3,
  Edit,
  MoreHorizontal,
  Mail,
  Phone,
  Building2,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  Timer,
  Target,
  Activity,
} from "lucide-react"
import { toast } from "sonner"
import { format, formatDistanceToNow, parseISO } from "date-fns"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

import { useAuth } from "@/contexts/auth-context"
import {
  techniciansApi,
  type TechnicianProfile,
  type TechnicianStats,
  type Task,
  type TimeEntry,
  TechnicianType,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { getStatusConfig } from "@/lib/constants"

export default function TechnicianDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const technicianId = params.id as string
  const [activeTab, setActiveTab] = useState("overview")

  // Fetch technician detail
  const { data: technician, isLoading, isError, error } = useQuery({
    queryKey: ["technician", technicianId],
    queryFn: () => techniciansApi.getById(technicianId),
    enabled: !!technicianId,
  })

  // Fetch tasks for technician
  const { data: tasks } = useQuery({
    queryKey: ["technicianTasks", technicianId],
    queryFn: () => techniciansApi.getTasks(technicianId),
    enabled: !!technicianId && activeTab === "tasks",
  })

  // Fetch attendance for technician
  const { data: attendance } = useQuery({
    queryKey: ["technicianAttendance", technicianId],
    queryFn: () => techniciansApi.getAttendance(technicianId),
    enabled: !!technicianId && activeTab === "attendance",
  })

  // Fetch performance metrics
  const { data: performance } = useQuery({
    queryKey: ["technicianPerformance", technicianId],
    queryFn: () => techniciansApi.getPerformance(technicianId),
    enabled: !!technicianId && activeTab === "performance",
  })

  // Fetch assignments
  const { data: assignments } = useQuery({
    queryKey: ["technicianAssignments", technicianId],
    queryFn: () => techniciansApi.getAssignments(technicianId),
    enabled: !!technicianId && activeTab === "locations",
  })

  const stats = technician?.stats

  // Helper functions
  const getTypeBadge = (type: TechnicianType) => {
    switch (type) {
      case TechnicianType.FULL_TIME:
        return <Badge className="bg-blue-100 text-blue-700">Full-Time</Badge>
      case TechnicianType.FREELANCER:
        return <Badge className="bg-purple-100 text-purple-700">Freelancer</Badge>
      default:
        return null
    }
  }

  // Check if user can manage technicians (ADMIN or DISPATCHER)
  const canManage = user?.role === "ADMIN" || user?.role === "DISPATCHER"

  if (isLoading) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="bg-white rounded-xl border p-6">
          <div className="flex gap-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-3 flex-1">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  if (isError || !technician) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Link href="/technicians">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Technicians
          </Button>
        </Link>
        <div className="bg-white rounded-xl border p-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-800 mb-2">
            Technician not found
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            {(error as Error)?.message || "The technician you're looking for doesn't exist."}
          </p>
          <Link href="/technicians">
            <Button>Back to Technicians</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Back button */}
      <Link href="/technicians">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Technicians
        </Button>
      </Link>

      {/* Profile Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex gap-6">
            {/* Avatar */}
            <div
              className={cn(
                "h-24 w-24 rounded-full flex items-center justify-center text-white text-2xl font-medium",
                technician.isOnline ? "bg-green-500" : "bg-slate-400"
              )}
            >
              {technician.firstName[0]}
              {technician.lastName[0]}
            </div>

            {/* Info */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold text-slate-800">
                  {technician.firstName} {technician.lastName}
                </h1>
                {getTypeBadge(technician.technicianType)}
                {technician.isActive ? (
                  technician.isOnline ? (
                    <Badge className="bg-green-100 text-green-700">Online</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-600">Offline</Badge>
                  )
                ) : (
                  <Badge className="bg-red-100 text-red-700">Inactive</Badge>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {technician.email}
                </span>
                {technician.specialty && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {technician.specialty}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                {/* Rating */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        "h-5 w-5",
                        star <= Math.round(technician.rating)
                          ? "text-amber-400 fill-amber-400"
                          : "text-slate-200"
                      )}
                    />
                  ))}
                  <span className="ml-1 text-sm font-medium">
                    {technician.rating.toFixed(1)}
                  </span>
                  <span className="text-sm text-slate-400">
                    ({technician.ratingCount} reviews)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {technician.isActive ? (
                  <DropdownMenuItem className="text-red-600">
                    Deactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="text-green-600">
                    Reactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <Clock className="h-4 w-4" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="locations" className="gap-2">
            <MapPin className="h-4 w-4" />
            Locations
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Completion Rate</p>
                    <p className="text-2xl font-semibold text-slate-800">
                      {stats?.performance.completionRate?.toFixed(0) || 0}%
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">On-Time Rate</p>
                    <p className="text-2xl font-semibold text-slate-800">
                      {stats?.performance.onTimeRate?.toFixed(0) || 0}%
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Target className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Tasks Completed</p>
                    <p className="text-2xl font-semibold text-slate-800">
                      {stats?.tasks.completed || 0}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <ClipboardList className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Hours This Week</p>
                    <p className="text-2xl font-semibold text-slate-800">
                      {stats?.attendance.totalHoursThisWeek?.toFixed(1) || 0}h
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                    <Timer className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current Tasks & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active Tasks</CardTitle>
                <CardDescription>
                  Currently assigned tasks: {stats?.tasks.inProgress || 0} in progress,{" "}
                  {stats?.tasks.assigned || 0} assigned
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-slate-500">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p>Task details available in Tasks tab</p>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
                <CardDescription>Latest actions by this technician</CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {stats.recentActivity.slice(0, 5).map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 text-sm"
                      >
                        <div className="h-2 w-2 rounded-full bg-blue-500 mt-2" />
                        <div className="flex-1">
                          <p className="text-slate-700">{activity.description}</p>
                          <p className="text-slate-400 text-xs">
                            {formatDistanceToNow(new Date(activity.timestamp), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Activity className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p>No recent activity</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>Task History</CardTitle>
              <CardDescription>
                All tasks assigned to this technician
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tasks && tasks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task: Task) => {
                      const statusConfig = getStatusConfig(task.status)
                      return (
                        <TableRow
                          key={task.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => router.push(`/tasks/${task.id}`)}
                        >
                          <TableCell className="font-medium">{task.title}</TableCell>
                          <TableCell>
                            <Badge className={statusConfig.bgClass}>
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">{task.priority?.toLowerCase()}</TableCell>
                          <TableCell>
                            {task.dueDate
                              ? format(new Date(task.dueDate), "MMM d, yyyy")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {format(new Date(task.createdAt), "MMM d, yyyy")}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <ClipboardList className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                  <p>No tasks found for this technician</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle>Attendance History</CardTitle>
              <CardDescription>
                Clock-in/out records for this technician
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attendance && attendance.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Clock In</TableHead>
                      <TableHead>Clock Out</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.map((entry: TimeEntry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          {format(new Date(entry.clockInAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          {format(new Date(entry.clockInAt), "h:mm a")}
                        </TableCell>
                        <TableCell>
                          {entry.clockOutAt
                            ? format(new Date(entry.clockOutAt), "h:mm a")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {entry.totalMinutes
                            ? `${Math.floor(entry.totalMinutes / 60)}h ${entry.totalMinutes % 60}m`
                            : "—"}
                        </TableCell>
                        <TableCell>{entry.location?.name || "—"}</TableCell>
                        <TableCell>
                          {entry.clockInWithinGeofence ? (
                            <Badge className="bg-green-100 text-green-700">In Zone</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700">
                              Out of Zone
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                  <p>No attendance records found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Locations Tab */}
        <TabsContent value="locations">
          <Card>
            <CardHeader>
              <CardTitle>Location Assignments</CardTitle>
              <CardDescription>
                Company locations assigned to this technician
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assignments && assignments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className={cn(
                        "border rounded-lg p-4",
                        assignment.isPrimary && "border-blue-500 bg-blue-50"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-slate-800">
                          {assignment.location.name}
                        </h4>
                        {assignment.isPrimary && (
                          <Badge className="bg-blue-100 text-blue-700">Primary</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mb-2">
                        {assignment.location.address}
                      </p>
                      <div className="text-xs text-slate-400">
                        <p>
                          Schedule: {assignment.schedule?.join(", ") || "All days"}
                        </p>
                        <p>
                          Effective from:{" "}
                          {format(new Date(assignment.effectiveFrom), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <MapPin className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                  <p>No location assignments</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <div className="space-y-6">
            {/* Performance Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-slate-500 mb-1">Completion Rate</p>
                    <p className="text-3xl font-bold text-green-600">
                      {performance?.summary.completionRate?.toFixed(0) || 0}%
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-slate-500 mb-1">On-Time Rate</p>
                    <p className="text-3xl font-bold text-blue-600">
                      {performance?.summary.onTimeRate?.toFixed(0) || 0}%
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-slate-500 mb-1">Tasks Completed</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {performance?.summary.tasksCompleted || 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Performance Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tasks Completed Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Tasks Completed</CardTitle>
                  <CardDescription>
                    Daily task completion over the period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {performance?.trends && performance.trends.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={performance.trends.map((t) => ({
                            ...t,
                            dateLabel: format(parseISO(t.date), "MMM d"),
                          }))}
                          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="dateLabel"
                            tick={{ fontSize: 12, fill: "#64748b" }}
                          />
                          <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#fff",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="completedTasks"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            dot={{ fill: "#8b5cf6", strokeWidth: 2 }}
                            name="Tasks Completed"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-50 rounded-lg">
                      <div className="text-center">
                        <BarChart3 className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                        <p>No performance data available</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* On-Time Rate & Hours Worked Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Performance Metrics</CardTitle>
                  <CardDescription>
                    On-time rate and hours worked trends
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {performance?.trends && performance.trends.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={performance.trends.map((t) => ({
                            ...t,
                            dateLabel: format(parseISO(t.date), "MMM d"),
                          }))}
                          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="dateLabel"
                            tick={{ fontSize: 12, fill: "#64748b" }}
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 12, fill: "#64748b" }}
                            domain={[0, 100]}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 12, fill: "#64748b" }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#fff",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                            }}
                          />
                          <Legend />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="onTimeRate"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={{ fill: "#2563eb", strokeWidth: 2 }}
                            name="On-Time Rate (%)"
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="hoursWorked"
                            stroke="#16a34a"
                            strokeWidth={2}
                            dot={{ fill: "#16a34a", strokeWidth: 2 }}
                            name="Hours Worked"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-50 rounded-lg">
                      <div className="text-center">
                        <BarChart3 className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                        <p>No performance data available</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Period Comparison */}
            {performance?.comparison && (
              <Card>
                <CardHeader>
                  <CardTitle>Period Comparison</CardTitle>
                  <CardDescription>
                    Changes compared to previous period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">Completion Rate</p>
                      <p
                        className={cn(
                          "text-xl font-semibold",
                          performance.comparison.completionRateChange >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        )}
                      >
                        {performance.comparison.completionRateChange >= 0 ? "+" : ""}
                        {performance.comparison.completionRateChange.toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">On-Time Rate</p>
                      <p
                        className={cn(
                          "text-xl font-semibold",
                          performance.comparison.onTimeRateChange >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        )}
                      >
                        {performance.comparison.onTimeRateChange >= 0 ? "+" : ""}
                        {performance.comparison.onTimeRateChange.toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">Rating</p>
                      <p
                        className={cn(
                          "text-xl font-semibold",
                          performance.comparison.ratingChange >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        )}
                      >
                        {performance.comparison.ratingChange >= 0 ? "+" : ""}
                        {performance.comparison.ratingChange.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">Tasks Completed</p>
                      <p
                        className={cn(
                          "text-xl font-semibold",
                          performance.comparison.tasksCompletedChange >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        )}
                      >
                        {performance.comparison.tasksCompletedChange >= 0 ? "+" : ""}
                        {performance.comparison.tasksCompletedChange.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
