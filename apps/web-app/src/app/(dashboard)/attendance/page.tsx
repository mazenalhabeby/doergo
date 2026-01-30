"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search,
  RefreshCw,
  Clock,
  MapPin,
  Users,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  Settings,
  Play,
  Timer,
  FileText,
  Download,
  BarChart3,
  TrendingUp,
  ClipboardCheck,
  Check,
  X,
  Coffee,
  UtensilsCrossed,
  Pause,
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import { attendanceApi, type TimeEntry, type CompanyLocation, type TimeEntryStatus, type AttendanceSummary, type Break, type BreakType, type BreakSummary } from "@/lib/api"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config = {
    CLOCKED_IN: {
      label: "Active",
      icon: CheckCircle2,
      className: "bg-green-50 text-green-700 border-green-200",
    },
    CLOCKED_OUT: {
      label: "Completed",
      icon: Clock,
      className: "bg-slate-50 text-slate-700 border-slate-200",
    },
    AUTO_OUT: {
      label: "Auto",
      icon: AlertCircle,
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
  }[status] || {
    label: status,
    icon: Clock,
    className: "bg-slate-50 text-slate-700 border-slate-200",
  }

  const Icon = config.icon

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border",
        config.className
      )}
    >
      <Icon className="size-3.5" />
      {config.label}
    </span>
  )
}

// Geofence indicator
function GeofenceIndicator({ withinGeofence }: { withinGeofence: boolean }) {
  return withinGeofence ? (
    <span className="inline-flex items-center gap-1 text-xs text-green-600">
      <CheckCircle2 className="size-3.5" />
      In range
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <AlertCircle className="size-3.5" />
      Outside
    </span>
  )
}

// Format duration from minutes
function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "-"
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  return `${hours}h ${mins}m`
}

// Parse date input (handles both Date objects and ISO strings)
function toDate(dateInput: Date | string): Date {
  return dateInput instanceof Date ? dateInput : parseISO(dateInput)
}

// Format time
function formatTime(dateInput: Date | string | null): string {
  if (!dateInput) return "-"
  return format(toDate(dateInput), "h:mm a")
}

// Stats card component
function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  color: "blue" | "green" | "amber" | "slate"
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-50 text-slate-600",
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn("p-2.5 rounded-lg", colorClasses[color])}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

export default function AttendancePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Tab state
  const [activeTab, setActiveTab] = useState<"tracking" | "reports" | "approvals" | "breaks">("tracking")

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  )
  const [page, setPage] = useState(1)
  const limit = 20

  // Reports states
  const [reportType, setReportType] = useState<"weekly" | "monthly">("weekly")

  // Check role - only ADMIN and DISPATCHER can access
  const canAccess = user?.role === "ADMIN" || user?.role === "DISPATCHER"
  const isAdmin = user?.role === "ADMIN"

  // Fetch locations
  const { data: locations = [], isLoading: loadingLocations } = useQuery({
    queryKey: ["locations"],
    queryFn: () => attendanceApi.getLocations(),
    enabled: canAccess,
  })

  // Fetch attendance entries - use getAllEntries for "all" locations, otherwise use getLocationEntries
  const {
    data: attendanceData,
    isLoading: loadingEntries,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["attendance", selectedLocationId, selectedStatus, selectedDate, page, limit],
    queryFn: () => {
      if (selectedLocationId === "all") {
        // Use getAllEntries for organization-wide view
        return attendanceApi.getAllEntries({
          date: selectedDate,
          status: selectedStatus !== "all" ? selectedStatus as TimeEntryStatus : undefined,
          page,
          limit,
        })
      }
      return attendanceApi.getLocationEntries(selectedLocationId, {
        date: selectedDate,
        page,
        limit,
      })
    },
    enabled: canAccess,
  })

  // Fetch scheduler info (ADMIN only)
  const { data: schedulerInfo } = useQuery({
    queryKey: ["scheduler-info"],
    queryFn: () => attendanceApi.getSchedulerInfo(),
    enabled: isAdmin,
    refetchInterval: 60000, // Refresh every minute
  })

  // Trigger auto clock-out mutation
  const triggerAutoClockOut = useMutation({
    mutationFn: (type: "hourly" | "midnight") => attendanceApi.triggerAutoClockOut(type),
    onSuccess: (data) => {
      toast.success(data?.data?.message || "Auto clock-out triggered")
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["scheduler-info"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to trigger auto clock-out")
    },
  })

  // Fetch weekly report
  const { data: weeklyReport, isLoading: loadingWeeklyReport } = useQuery({
    queryKey: ["attendance-report", "weekly"],
    queryFn: () => attendanceApi.getWeeklyReport(),
    enabled: canAccess && activeTab === "reports" && reportType === "weekly",
  })

  // Fetch monthly report
  const { data: monthlyReport, isLoading: loadingMonthlyReport } = useQuery({
    queryKey: ["attendance-report", "monthly"],
    queryFn: () => attendanceApi.getMonthlyReport(),
    enabled: canAccess && activeTab === "reports" && reportType === "monthly",
  })

  // Fetch pending approvals
  const { data: pendingApprovalsData, isLoading: loadingApprovals, refetch: refetchApprovals } = useQuery({
    queryKey: ["attendance-approvals"],
    queryFn: () => attendanceApi.getPendingApprovals({ limit: 50 }),
    enabled: canAccess && activeTab === "approvals",
  })

  // Breaks state
  const [breakDate, setBreakDate] = useState<string>(format(new Date(), "yyyy-MM-dd"))
  const [breakTypeFilter, setBreakTypeFilter] = useState<string>("all")

  // Fetch active breaks
  const { data: activeBreaks = [], isLoading: loadingActiveBreaks, refetch: refetchActiveBreaks } = useQuery({
    queryKey: ["attendance-breaks-active"],
    queryFn: () => attendanceApi.getActiveBreaks(),
    enabled: canAccess && activeTab === "breaks",
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Fetch break history
  const { data: breakHistoryData, isLoading: loadingBreakHistory, refetch: refetchBreakHistory } = useQuery({
    queryKey: ["attendance-breaks-history", breakDate, breakTypeFilter],
    queryFn: () => attendanceApi.getBreakHistory({
      date: breakDate,
      type: breakTypeFilter !== "all" ? breakTypeFilter as BreakType : undefined,
      limit: 50,
    }),
    enabled: canAccess && activeTab === "breaks",
  })

  // Fetch break summary for the selected date
  const { data: breakSummary, isLoading: loadingBreakSummary } = useQuery({
    queryKey: ["attendance-breaks-summary", breakDate],
    queryFn: () => attendanceApi.getBreakSummary({
      startDate: breakDate,
      endDate: breakDate,
    }),
    enabled: canAccess && activeTab === "breaks",
  })

  // End break mutation
  const endBreakManually = useMutation({
    mutationFn: ({ breakId, notes }: { breakId: string; notes?: string }) =>
      attendanceApi.endBreakManually(breakId, notes),
    onSuccess: () => {
      toast.success("Break ended successfully")
      queryClient.invalidateQueries({ queryKey: ["attendance-breaks-active"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-breaks-history"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to end break")
    },
  })

  // Export to CSV mutation
  const exportCSV = useMutation({
    mutationFn: () => {
      const currentReport = reportType === "weekly" ? weeklyReport : monthlyReport
      if (!currentReport?.period) {
        throw new Error("No report data available")
      }
      return attendanceApi.exportToCSV({
        startDate: currentReport.period.startDate,
        endDate: currentReport.period.endDate,
      })
    },
    onSuccess: (data) => {
      if (data) {
        // Create blob and download
        const blob = new Blob([data.content], { type: data.mimeType })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = data.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        toast.success(`Exported ${data.recordCount} records`)
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to export")
    },
  })

  // Approve entry mutation
  const approveEntry = useMutation({
    mutationFn: (entryId: string) => attendanceApi.approveEntry(entryId),
    onSuccess: () => {
      toast.success("Entry approved")
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to approve")
    },
  })

  // Reject entry mutation
  const [rejectReason, setRejectReason] = useState("")
  const rejectEntry = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: string; reason: string }) =>
      attendanceApi.rejectEntry(entryId, reason),
    onSuccess: () => {
      toast.success("Entry rejected")
      setRejectReason("")
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reject")
    },
  })

  const entries = attendanceData?.data || []
  const meta = attendanceData?.meta

  // Calculate stats
  const stats = useMemo(() => {
    const activeCount = entries.filter((e: TimeEntry) => e.status === "CLOCKED_IN").length
    const completedCount = entries.filter((e: TimeEntry) => e.status === "CLOCKED_OUT").length
    const autoOutCount = entries.filter((e: TimeEntry) => e.status === "AUTO_OUT").length
    const totalMinutes = entries.reduce(
      (sum: number, e: TimeEntry) => sum + (e.totalMinutes || 0),
      0
    )

    return {
      active: activeCount,
      completed: completedCount,
      autoOut: autoOutCount,
      totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    }
  }, [entries])

  // Filter entries with geofence violations
  const geofenceViolations = useMemo(() => {
    return entries.filter((e: TimeEntry) =>
      !e.clockInWithinGeofence || (e.clockOutAt && e.clockOutWithinGeofence === false)
    )
  }, [entries])

  // Client-side search filter
  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries

    const query = searchQuery.toLowerCase()
    return entries.filter((entry: TimeEntry) => {
      const name = `${entry.user?.firstName || ""} ${entry.user?.lastName || ""}`.toLowerCase()
      return name.includes(query)
    })
  }, [entries, searchQuery])

  // Not authorized
  if (!canAccess) {
    return (
      <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="text-center">
          <XCircle className="size-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800">Access Denied</h2>
          <p className="text-slate-500 mt-2">
            You don't have permission to view this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Attendance Management
            </h1>
            <p className="mt-1.5 text-slate-500">
              Track attendance, view reports, and manage approvals
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as typeof activeTab)} className="mb-6">
          <TabsList className="bg-white border border-slate-200/60 rounded-xl p-1 shadow-sm">
            <TabsTrigger
              value="tracking"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 rounded-lg px-4 py-2"
            >
              <Clock className="size-4 mr-2" />
              Daily Tracking
            </TabsTrigger>
            <TabsTrigger
              value="reports"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 rounded-lg px-4 py-2"
            >
              <BarChart3 className="size-4 mr-2" />
              Reports
            </TabsTrigger>
            <TabsTrigger
              value="approvals"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 rounded-lg px-4 py-2 relative"
            >
              <ClipboardCheck className="size-4 mr-2" />
              Approvals
              {pendingApprovalsData?.meta?.total ? (
                <span className="ml-2 inline-flex items-center justify-center size-5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                  {pendingApprovalsData.meta.total}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="breaks"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 rounded-lg px-4 py-2 relative"
            >
              <Coffee className="size-4 mr-2" />
              Breaks
              {activeBreaks.length > 0 ? (
                <span className="ml-2 inline-flex items-center justify-center size-5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                  {activeBreaks.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* Daily Tracking Tab */}
          <TabsContent value="tracking" className="mt-6">

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Currently Active"
            value={stats.active}
            icon={Users}
            color="green"
          />
          <StatCard
            title="Completed Shifts"
            value={stats.completed}
            icon={CheckCircle2}
            color="blue"
          />
          <StatCard
            title="Auto Clock-Out"
            value={stats.autoOut}
            icon={AlertCircle}
            color="amber"
          />
          <StatCard
            title="Total Hours"
            value={`${stats.totalHours}h`}
            icon={Clock}
            color="slate"
          />
        </div>

        {/* Geofence Alerts Section */}
        {geofenceViolations.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-200/60 shadow-sm mb-8">
            <div className="p-5 border-b border-amber-100 bg-amber-50/50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                  <AlertCircle className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-amber-900">
                    Geofence Alerts ({geofenceViolations.length})
                  </h2>
                  <p className="text-sm text-amber-700">
                    Entries where clock-in or clock-out occurred outside the designated geofence
                  </p>
                </div>
              </div>
            </div>
            <div className="divide-y divide-amber-100">
              {geofenceViolations.slice(0, 5).map((entry: TimeEntry) => (
                <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-amber-50/30">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-medium text-sm">
                      {entry.user?.firstName?.[0]}
                      {entry.user?.lastName?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {entry.user?.firstName} {entry.user?.lastName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {entry.location?.name || "Unknown location"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">
                        {formatTime(entry.clockInAt)}
                        {entry.clockOutAt && ` - ${formatTime(entry.clockOutAt)}`}
                      </p>
                      <div className="flex items-center gap-2 justify-end">
                        {!entry.clockInWithinGeofence && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <MapPin className="size-3" />
                            Clock-in outside
                          </span>
                        )}
                        {entry.clockOutAt && entry.clockOutWithinGeofence === false && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <MapPin className="size-3" />
                            Clock-out outside
                          </span>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>
                </div>
              ))}
              {geofenceViolations.length > 5 && (
                <div className="p-3 text-center text-sm text-amber-600">
                  + {geofenceViolations.length - 5} more alerts
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scheduler Section (ADMIN only) */}
        {isAdmin && schedulerInfo && (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
                  <Settings className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Auto Clock-Out Scheduler
                  </h2>
                  <p className="text-sm text-slate-500">
                    Automatic clock-out runs hourly and at midnight
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerAutoClockOut.mutate("hourly")}
                  disabled={triggerAutoClockOut.isPending}
                  className="rounded-lg"
                >
                  <Play className="size-4 mr-1.5" />
                  Run Hourly Check
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerAutoClockOut.mutate("midnight")}
                  disabled={triggerAutoClockOut.isPending}
                  className="rounded-lg"
                >
                  <Timer className="size-4 mr-1.5" />
                  Run Midnight Check
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Scheduled Jobs */}
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  Scheduled Jobs
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {schedulerInfo.repeatableJobs?.length || 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {schedulerInfo.repeatableJobs?.map((j) => j.name).join(", ") || "None"}
                </p>
              </div>

              {/* Queue Stats */}
              <div className="p-4 bg-blue-50 rounded-xl">
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-2">
                  Active Jobs
                </p>
                <p className="text-2xl font-bold text-blue-700">
                  {schedulerInfo.queueStats?.active || 0}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  {schedulerInfo.queueStats?.waiting || 0} waiting
                </p>
              </div>

              <div className="p-4 bg-green-50 rounded-xl">
                <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-2">
                  Completed
                </p>
                <p className="text-2xl font-bold text-green-700">
                  {schedulerInfo.queueStats?.completed || 0}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Total completed jobs
                </p>
              </div>

              <div className="p-4 bg-red-50 rounded-xl">
                <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-2">
                  Failed
                </p>
                <p className="text-2xl font-bold text-red-700">
                  {schedulerInfo.queueStats?.failed || 0}
                </p>
                <p className="text-xs text-red-600 mt-1">
                  Check Bull Board for details
                </p>
              </div>
            </div>

            {/* Next scheduled runs */}
            {schedulerInfo.repeatableJobs && schedulerInfo.repeatableJobs.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  Next Scheduled Runs
                </p>
                <div className="flex flex-wrap gap-2">
                  {schedulerInfo.repeatableJobs.map((job, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg"
                    >
                      <Clock className="size-3" />
                      {job.id || job.name}:{" "}
                      {job.next
                        ? format(new Date(job.next), "MMM d, h:mm a")
                        : job.pattern || `Every ${Math.round((job.every || 0) / 60000)}min`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm"
            />
          </div>

          {/* Location Filter */}
          <Select
            value={selectedLocationId}
            onValueChange={(value) => {
              setSelectedLocationId(value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[200px] h-11 rounded-xl bg-white border-slate-200/80 shadow-sm">
              <MapPin className="size-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((location: CompanyLocation) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={selectedStatus}
            onValueChange={(value) => {
              setSelectedStatus(value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[150px] h-11 rounded-xl bg-white border-slate-200/80 shadow-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="CLOCKED_IN">Active</SelectItem>
              <SelectItem value="CLOCKED_OUT">Completed</SelectItem>
              <SelectItem value="AUTO_OUT">Auto Clock-Out</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                setPage(1)
              }}
              className="pl-10 w-[180px] h-11 bg-white/80 border-slate-200/80 rounded-xl shadow-sm"
            />
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            className="h-11 w-11 rounded-xl border-slate-200/80 bg-white shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="size-4 text-slate-500" />
          </Button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          {loadingEntries || loadingLocations ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="size-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-800">
                Failed to load attendance
              </h3>
              <p className="text-slate-500 mt-1">
                {error instanceof Error ? error.message : "An error occurred"}
              </p>
              <Button
                variant="outline"
                onClick={() => refetch()}
                className="mt-4"
              >
                <RefreshCw className="size-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="size-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-800">
                No attendance records
              </h3>
              <p className="text-slate-500 mt-1">
                {selectedLocationId === "all"
                  ? "Select a location to view attendance"
                  : "No entries found for this date and location"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="font-semibold">Technician</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Clock In</TableHead>
                    <TableHead className="font-semibold">Clock Out</TableHead>
                    <TableHead className="font-semibold">Duration</TableHead>
                    <TableHead className="font-semibold">Geofence</TableHead>
                    <TableHead className="font-semibold">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry: TimeEntry) => (
                    <TableRow key={entry.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm">
                            {entry.user?.firstName?.[0]}
                            {entry.user?.lastName?.[0]}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {entry.user?.firstName} {entry.user?.lastName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {entry.location?.name || "Unknown location"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={entry.status} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">
                            {formatTime(entry.clockInAt)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {format(toDate(entry.clockInAt), "MMM d")}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.clockOutAt ? (
                          <div>
                            <p className="font-medium text-slate-900">
                              {formatTime(entry.clockOutAt)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {format(toDate(entry.clockOutAt), "MMM d")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-slate-900">
                          {formatDuration(entry.totalMinutes)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <GeofenceIndicator
                          withinGeofence={entry.clockInWithinGeofence}
                        />
                      </TableCell>
                      <TableCell>
                        {entry.notes ? (
                          <span
                            className="text-sm text-slate-600 truncate max-w-[150px] block"
                            title={entry.notes}
                          >
                            {entry.notes}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                  <p className="text-sm text-slate-500">
                    Showing {(page - 1) * limit + 1} to{" "}
                    {Math.min(page * limit, meta.total)} of {meta.total} entries
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-slate-600 px-3">
                      Page {page} of {meta.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                      disabled={page === meta.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="mt-6">
            {/* Report Type Toggle */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Button
                  variant={reportType === "weekly" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReportType("weekly")}
                  className="rounded-lg"
                >
                  Weekly Report
                </Button>
                <Button
                  variant={reportType === "monthly" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReportType("monthly")}
                  className="rounded-lg"
                >
                  Monthly Report
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCSV.mutate()}
                disabled={exportCSV.isPending || (!weeklyReport && !monthlyReport)}
                className="rounded-lg"
              >
                <Download className="size-4 mr-2" />
                Export CSV
              </Button>
            </div>

            {/* Report Content */}
            {(loadingWeeklyReport || loadingMonthlyReport) ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-48 w-full rounded-xl" />
              </div>
            ) : (
              (() => {
                const report = reportType === "weekly" ? weeklyReport : monthlyReport
                if (!report) {
                  return (
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-12 text-center">
                      <FileText className="size-12 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-slate-800">No report data</h3>
                      <p className="text-slate-500 mt-1">Select a report type to view attendance data</p>
                    </div>
                  )
                }

                return (
                  <div className="space-y-6">
                    {/* Period Info */}
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900">
                          {reportType === "weekly" ? "Weekly" : "Monthly"} Summary
                        </h2>
                        <span className="text-sm text-slate-500">
                          {report.period.startDate} to {report.period.endDate} ({report.period.workDays} work days)
                        </span>
                      </div>

                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-blue-50 rounded-xl">
                          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Total Hours</p>
                          <p className="text-2xl font-bold text-blue-700">{report.summary.totalHours}h</p>
                          <p className="text-xs text-blue-600">Across {report.summary.totalShifts} shifts</p>
                        </div>
                        <div className="p-4 bg-green-50 rounded-xl">
                          <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Standard Hours</p>
                          <p className="text-2xl font-bold text-green-700">{report.summary.standardHours}h</p>
                          <p className="text-xs text-green-600">Expected for period</p>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-xl">
                          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-1">Overtime</p>
                          <p className="text-2xl font-bold text-amber-700">{report.summary.overtimeHours}h</p>
                          <p className="text-xs text-amber-600">Above standard</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl">
                          <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">Avg Shift</p>
                          <p className="text-2xl font-bold text-slate-700">{report.summary.averageShiftHours}h</p>
                          <p className="text-xs text-slate-500">{report.summary.autoClockOuts} auto clock-outs</p>
                        </div>
                      </div>
                    </div>

                    {/* By User */}
                    {report.byUser.length > 0 && (
                      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                        <h3 className="text-md font-semibold text-slate-900 mb-4">By Technician</h3>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50/50">
                              <TableHead className="font-semibold">Technician</TableHead>
                              <TableHead className="font-semibold">Total Hours</TableHead>
                              <TableHead className="font-semibold">Shifts</TableHead>
                              <TableHead className="font-semibold">Avg Shift</TableHead>
                              <TableHead className="font-semibold">Auto Clock-Outs</TableHead>
                              <TableHead className="font-semibold">Locations</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {report.byUser.map((item) => (
                              <TableRow key={item.user.id}>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div className="size-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm">
                                      {item.user.firstName?.[0]}{item.user.lastName?.[0]}
                                    </div>
                                    <div>
                                      <p className="font-medium text-slate-900">
                                        {item.user.firstName} {item.user.lastName}
                                      </p>
                                      <p className="text-xs text-slate-500">{item.user.email}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium">{item.totalHours}h</TableCell>
                                <TableCell>{item.shifts}</TableCell>
                                <TableCell>{item.averageShiftHours}h</TableCell>
                                <TableCell>
                                  {item.autoClockOuts > 0 ? (
                                    <span className="text-amber-600">{item.autoClockOuts}</span>
                                  ) : (
                                    <span className="text-slate-400">0</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm text-slate-600">
                                    {item.locations.join(", ")}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* By Location */}
                    {report.byLocation.length > 0 && (
                      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                        <h3 className="text-md font-semibold text-slate-900 mb-4">By Location</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {report.byLocation.map((item) => (
                            <div key={item.location.id} className="p-4 bg-slate-50 rounded-xl">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="size-4 text-slate-500" />
                                <p className="font-medium text-slate-900">{item.location.name}</p>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                  <p className="text-lg font-bold text-slate-900">{item.totalHours}h</p>
                                  <p className="text-xs text-slate-500">Hours</p>
                                </div>
                                <div>
                                  <p className="text-lg font-bold text-slate-900">{item.shifts}</p>
                                  <p className="text-xs text-slate-500">Shifts</p>
                                </div>
                                <div>
                                  <p className="text-lg font-bold text-slate-900">{item.uniqueTechnicians}</p>
                                  <p className="text-xs text-slate-500">Technicians</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()
            )}
          </TabsContent>

          {/* Approvals Tab */}
          <TabsContent value="approvals" className="mt-6">
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Pending Approvals</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Review and approve time entries that require manager approval
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchApprovals()}
                    className="rounded-lg"
                  >
                    <RefreshCw className="size-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>

              {loadingApprovals ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !pendingApprovalsData?.data?.length ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="size-12 text-green-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-800">All caught up!</h3>
                  <p className="text-slate-500 mt-1">No pending approvals at this time</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-semibold">Technician</TableHead>
                      <TableHead className="font-semibold">Location</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Clock In</TableHead>
                      <TableHead className="font-semibold">Clock Out</TableHead>
                      <TableHead className="font-semibold">Duration</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingApprovalsData.data.map((entry: TimeEntry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-medium text-sm">
                              {entry.user?.firstName?.[0]}{entry.user?.lastName?.[0]}
                            </div>
                            <p className="font-medium text-slate-900">
                              {entry.user?.firstName} {entry.user?.lastName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{entry.location?.name || "Unknown"}</TableCell>
                        <TableCell>{format(toDate(entry.clockInAt), "MMM d, yyyy")}</TableCell>
                        <TableCell>{formatTime(entry.clockInAt)}</TableCell>
                        <TableCell>{entry.clockOutAt ? formatTime(entry.clockOutAt) : "-"}</TableCell>
                        <TableCell className="font-medium">{formatDuration(entry.totalMinutes)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => approveEntry.mutate(entry.id)}
                              disabled={approveEntry.isPending}
                              className="rounded-lg text-green-600 border-green-200 hover:bg-green-50"
                            >
                              <Check className="size-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const reason = prompt("Rejection reason:")
                                if (reason) {
                                  rejectEntry.mutate({ entryId: entry.id, reason })
                                }
                              }}
                              disabled={rejectEntry.isPending}
                              className="rounded-lg text-red-600 border-red-200 hover:bg-red-50"
                            >
                              <X className="size-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Breaks Tab */}
          <TabsContent value="breaks" className="mt-6">
            {/* Break Statistics */}
            {!loadingBreakSummary && breakSummary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                  title="Total Breaks"
                  value={breakSummary.totalBreaks}
                  icon={Coffee}
                  color="blue"
                />
                <StatCard
                  title="Total Break Time"
                  value={formatDuration(breakSummary.totalBreakMinutes)}
                  icon={Clock}
                  color="amber"
                />
                <StatCard
                  title="Average Break"
                  value={`${breakSummary.averageBreakMinutes}m`}
                  icon={TrendingUp}
                  color="green"
                />
                <StatCard
                  title="Active Now"
                  value={activeBreaks.length}
                  icon={Users}
                  color="slate"
                />
              </div>
            )}

            {/* Break Stats by Type */}
            {!loadingBreakSummary && breakSummary && breakSummary.totalBreaks > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 mb-6">
                <h3 className="text-md font-semibold text-slate-900 mb-4">Breaks by Type</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-amber-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <UtensilsCrossed className="size-5 text-amber-600" />
                      <p className="font-medium text-amber-900">Lunch Breaks</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-amber-900">{breakSummary.breaksByType?.LUNCH?.count || 0}</p>
                        <p className="text-xs text-amber-600">Count</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-amber-900">{formatDuration(breakSummary.breaksByType?.LUNCH?.totalMinutes || 0)}</p>
                        <p className="text-xs text-amber-600">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-amber-900">{breakSummary.breaksByType?.LUNCH?.averageMinutes || 0}m</p>
                        <p className="text-xs text-amber-600">Avg</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Coffee className="size-5 text-blue-600" />
                      <p className="font-medium text-blue-900">Short Breaks</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-blue-900">{breakSummary.breaksByType?.SHORT?.count || 0}</p>
                        <p className="text-xs text-blue-600">Count</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-blue-900">{formatDuration(breakSummary.breaksByType?.SHORT?.totalMinutes || 0)}</p>
                        <p className="text-xs text-blue-600">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-blue-900">{breakSummary.breaksByType?.SHORT?.averageMinutes || 0}m</p>
                        <p className="text-xs text-blue-600">Avg</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Pause className="size-5 text-slate-600" />
                      <p className="font-medium text-slate-900">Other Breaks</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-slate-900">{breakSummary.breaksByType?.OTHER?.count || 0}</p>
                        <p className="text-xs text-slate-600">Count</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-slate-900">{formatDuration(breakSummary.breaksByType?.OTHER?.totalMinutes || 0)}</p>
                        <p className="text-xs text-slate-600">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-slate-900">{breakSummary.breaksByType?.OTHER?.averageMinutes || 0}m</p>
                        <p className="text-xs text-slate-600">Avg</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Active Breaks Section */}
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm mb-6">
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-orange-50 text-orange-600">
                      <Coffee className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Active Breaks</h2>
                      <p className="text-sm text-slate-500">
                        Technicians currently on break
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchActiveBreaks()}
                    className="rounded-lg"
                  >
                    <RefreshCw className="size-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>

              {loadingActiveBreaks ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : activeBreaks.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="size-12 text-green-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-800">No active breaks</h3>
                  <p className="text-slate-500 mt-1">All technicians are working</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeBreaks.map((breakItem: Break) => (
                    <div key={breakItem.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "size-10 rounded-full flex items-center justify-center",
                          breakItem.type === "LUNCH" ? "bg-amber-100 text-amber-600" :
                          breakItem.type === "SHORT" ? "bg-blue-100 text-blue-600" :
                          "bg-slate-100 text-slate-600"
                        )}>
                          {breakItem.type === "LUNCH" ? (
                            <UtensilsCrossed className="size-5" />
                          ) : breakItem.type === "SHORT" ? (
                            <Coffee className="size-5" />
                          ) : (
                            <Pause className="size-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {breakItem.user?.firstName} {breakItem.user?.lastName}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <span className="capitalize">{breakItem.type.toLowerCase()} break</span>
                            <span>•</span>
                            <span>Started {formatTime(breakItem.startedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full",
                          "bg-orange-50 text-orange-700 border border-orange-200"
                        )}>
                          <Clock className="size-3.5" />
                          On break
                        </span>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm("End this break manually?")) {
                                endBreakManually.mutate({ breakId: breakItem.id })
                              }
                            }}
                            disabled={endBreakManually.isPending}
                            className="rounded-lg text-red-600 border-red-200 hover:bg-red-50"
                          >
                            End Break
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Break History Section */}
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Break History</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      View past break records
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Break Type Filter */}
                    <Select
                      value={breakTypeFilter}
                      onValueChange={setBreakTypeFilter}
                    >
                      <SelectTrigger className="w-[130px] h-10 rounded-lg bg-white border-slate-200/80 shadow-sm">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="LUNCH">Lunch</SelectItem>
                        <SelectItem value="SHORT">Short</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Date Filter */}
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <Input
                        type="date"
                        value={breakDate}
                        onChange={(e) => setBreakDate(e.target.value)}
                        className="pl-9 w-[160px] h-10 bg-white/80 border-slate-200/80 rounded-lg shadow-sm"
                      />
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => refetchBreakHistory()}
                      className="h-10 w-10 rounded-lg border-slate-200/80 bg-white shadow-sm hover:bg-slate-50"
                    >
                      <RefreshCw className="size-4 text-slate-500" />
                    </Button>
                  </div>
                </div>
              </div>

              {loadingBreakHistory ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !breakHistoryData?.data?.length ? (
                <div className="p-12 text-center">
                  <Coffee className="size-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-800">No break records</h3>
                  <p className="text-slate-500 mt-1">No breaks found for the selected date</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-semibold">Technician</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Started</TableHead>
                      <TableHead className="font-semibold">Ended</TableHead>
                      <TableHead className="font-semibold">Duration</TableHead>
                      <TableHead className="font-semibold">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakHistoryData.data.map((breakItem: Break) => (
                      <TableRow key={breakItem.id} className="hover:bg-slate-50/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm">
                              {breakItem.user?.firstName?.[0]}{breakItem.user?.lastName?.[0]}
                            </div>
                            <span className="font-medium text-slate-900">
                              {breakItem.user?.firstName} {breakItem.user?.lastName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border",
                            breakItem.type === "LUNCH" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            breakItem.type === "SHORT" ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-slate-50 text-slate-700 border-slate-200"
                          )}>
                            {breakItem.type === "LUNCH" ? (
                              <UtensilsCrossed className="size-3.5" />
                            ) : breakItem.type === "SHORT" ? (
                              <Coffee className="size-3.5" />
                            ) : (
                              <Pause className="size-3.5" />
                            )}
                            {breakItem.type.charAt(0) + breakItem.type.slice(1).toLowerCase()}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-900">{formatTime(breakItem.startedAt)}</TableCell>
                        <TableCell className="text-slate-900">
                          {breakItem.endedAt ? formatTime(breakItem.endedAt) : (
                            <span className="text-orange-600">On break</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">
                          {formatDuration(breakItem.durationMinutes)}
                        </TableCell>
                        <TableCell>
                          {breakItem.notes ? (
                            <span className="text-sm text-slate-600 truncate max-w-[150px] block" title={breakItem.notes}>
                              {breakItem.notes}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
