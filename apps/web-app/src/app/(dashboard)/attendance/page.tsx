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
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import { UserAvatar } from "@/components/user-avatar"
import { attendanceApi, locationsApi, type TimeEntry, type CompanyLocation, type TimeEntryStatus, type AttendanceSummary, type Break, type BreakType, type BreakSummary } from "@/lib/api"
import { ReportsTab } from "./_components/reports-tab"
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
import { cn, formatDurationMinutes } from "@/lib/utils"

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config = {
    CLOCKED_IN: {
      label: "Active",
      icon: CheckCircle2,
      className: "bg-green-500/10 text-green-700 border-green-200",
    },
    CLOCKED_OUT: {
      label: "Completed",
      icon: Clock,
      className: "bg-muted text-foreground border-border",
    },
    AUTO_OUT: {
      label: "Auto",
      icon: AlertCircle,
      className: "bg-amber-500/10 text-amber-700 border-amber-200",
    },
  }[status] || {
    label: status,
    icon: Clock,
    className: "bg-muted text-foreground border-border",
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

// Flag reason badge for smart auto-approval
const FLAG_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  OVERTIME: { label: "Overtime", className: "bg-orange-50 dark:bg-orange-500/10 text-orange-700 border-orange-200" },
  MISSED_CLOCK_OUT: { label: "Missed Clock-Out", className: "bg-red-500/10 text-red-700 border-red-200" },
  OUTSIDE_GEOFENCE_IN: { label: "Geofence (In)", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  OUTSIDE_GEOFENCE_OUT: { label: "Geofence (Out)", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  LATE_ARRIVAL: { label: "Late Arrival", className: "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  EARLY_DEPARTURE: { label: "Early Departure", className: "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  UNSCHEDULED_DAY: { label: "Unscheduled", className: "bg-purple-50 dark:bg-purple-500/10 text-purple-700 border-purple-200" },
}

function FlagReasonBadges({ reasons }: { reasons?: string[] }) {
  if (!reasons || reasons.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((reason) => {
        const config = FLAG_BADGE_CONFIG[reason] || { label: reason, className: "bg-muted text-muted-foreground border-border" }
        return (
          <span
            key={reason}
            className={cn(
              "inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border",
              config.className
            )}
          >
            {config.label}
          </span>
        )
      })}
    </div>
  )
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
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    slate: "bg-muted text-muted-foreground",
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-4">
        <div className={cn("p-3 rounded-xl", colorClasses[color])}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
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
  // reportType and reportLocationId moved to ReportsTab component

  // Check role - only ADMIN and DISPATCHER can access
  const canAccess = user?.role === "ADMIN" || user?.role === "MANAGER"
  const isAdmin = user?.role === "ADMIN"

  // Fetch locations
  const { data: locationsRaw, isLoading: loadingLocations } = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list(),
    enabled: canAccess,
  })
  const locations = locationsRaw?.data || []

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
  })

  // Trigger auto clock-out mutation
  const triggerAutoClockOut = useMutation({
    mutationFn: (type: "hourly" | "midnight") => attendanceApi.triggerAutoClockOut(type),
    onSuccess: (data) => {
      notify.success(data?.data?.message || "Auto clock-out triggered")
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["scheduler-info"] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : "Failed to trigger auto clock-out")
    },
  })

  // Weekly/monthly reports moved to ReportsTab component

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
      notify.success("Break ended successfully")
      queryClient.invalidateQueries({ queryKey: ["attendance-breaks-active"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-breaks-history"] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : "Failed to end break")
    },
  })

  // Export CSV moved to ReportsTab component

  // Approve entry mutation
  const approveEntry = useMutation({
    mutationFn: (entryId: string) => attendanceApi.approveEntry(entryId),
    onSuccess: () => {
      notify.success("Entry approved")
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : "Failed to approve")
    },
  })

  // Reject entry mutation
  const [rejectReason, setRejectReason] = useState("")
  const rejectEntry = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: string; reason: string }) =>
      attendanceApi.rejectEntry(entryId, reason),
    onSuccess: () => {
      notify.success("Entry rejected")
      setRejectReason("")
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : "Failed to reject")
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
      <div className="min-h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <XCircle className="size-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
          <p className="text-muted-foreground mt-2">
            You don't have permission to view this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                Attendance Management
              </h1>
              <p className="mt-1.5 text-muted-foreground">
                Track attendance, view reports, and manage approvals
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as typeof activeTab)} className="mb-6">
          <TabsList className="bg-card border border-border/60 rounded-xl p-1 shadow-sm h-auto">
            <TabsTrigger
              value="tracking"
              className="data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium transition-all"
            >
              <Clock className="size-3.5 mr-1.5" />
              Tracking
            </TabsTrigger>
            <TabsTrigger
              value="reports"
              className="data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium transition-all"
            >
              <BarChart3 className="size-3.5 mr-1.5" />
              Reports
            </TabsTrigger>
            <TabsTrigger
              value="approvals"
              className="data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium transition-all relative"
            >
              <ClipboardCheck className="size-3.5 mr-1.5" />
              Approvals
              {pendingApprovalsData?.meta?.total ? (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-amber-400 text-white rounded-full px-1">
                  {pendingApprovalsData.meta.total}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="breaks"
              className="data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium transition-all relative"
            >
              <Coffee className="size-3.5 mr-1.5" />
              Breaks
              {activeBreaks.length > 0 ? (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-orange-400 text-white rounded-full px-1">
                  {activeBreaks.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* Daily Tracking Tab */}
          <TabsContent value="tracking" className="mt-6">

        {/* Stats Cards — only show when there's data */}
        {entries.length > 0 && (
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
        )}

        {/* Geofence Alerts Section */}
        {geofenceViolations.length > 0 && (
          <div className="bg-card rounded-2xl border border-amber-200/60 shadow-sm mb-8">
            <div className="p-5 border-b border-amber-100 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
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
                <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-amber-50/30 dark:hover:bg-amber-500/5">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      firstName={entry.user?.firstName}
                      lastName={entry.user?.lastName}

                      seed={entry.user?.id}
                      size="md"
                    />
                    <div>
                      <p className="font-medium text-foreground">
                        {entry.user?.firstName} {entry.user?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.location?.name || "Unknown location"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">
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

        {/* Scheduler Section (ADMIN only) — compact collapsible */}
        {isAdmin && schedulerInfo && (
          <details className="bg-card rounded-2xl border border-border/60 shadow-sm mb-8 group">
            <summary className="flex items-center justify-between p-4 cursor-pointer select-none hover:bg-accent/50 rounded-2xl transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600">
                  <Settings className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Auto Clock-Out Scheduler
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {schedulerInfo.repeatableJobs?.length || 0} jobs · {schedulerInfo.queueStats?.active || 0} active · {schedulerInfo.queueStats?.failed || 0} failed
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.preventDefault(); triggerAutoClockOut.mutate("hourly") }}
                  disabled={triggerAutoClockOut.isPending}
                  className="rounded-lg h-8 text-xs"
                >
                  <Play className="size-3 mr-1" />
                  Hourly
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.preventDefault(); triggerAutoClockOut.mutate("midnight") }}
                  disabled={triggerAutoClockOut.isPending}
                  className="rounded-lg h-8 text-xs"
                >
                  <Timer className="size-3 mr-1" />
                  Midnight
                </Button>
              </div>
            </summary>
            <div className="px-4 pb-4 pt-2 border-t border-border">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-muted rounded-xl">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Scheduled</p>
                  <p className="text-lg font-bold text-foreground">{schedulerInfo.repeatableJobs?.length || 0}</p>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                  <p className="text-[10px] font-medium text-blue-600 uppercase tracking-wide mb-1">Active</p>
                  <p className="text-lg font-bold text-blue-700">{schedulerInfo.queueStats?.active || 0}</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-xl">
                  <p className="text-[10px] font-medium text-green-600 uppercase tracking-wide mb-1">Completed</p>
                  <p className="text-lg font-bold text-green-700">{schedulerInfo.queueStats?.completed || 0}</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-500/10 rounded-xl">
                  <p className="text-[10px] font-medium text-red-600 uppercase tracking-wide mb-1">Failed</p>
                  <p className="text-lg font-bold text-red-700">{schedulerInfo.queueStats?.failed || 0}</p>
                </div>
              </div>
              {schedulerInfo.repeatableJobs && schedulerInfo.repeatableJobs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {schedulerInfo.repeatableJobs.map((job, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-muted text-muted-foreground text-xs rounded-lg"
                    >
                      <Clock className="size-3" />
                      {job.next
                        ? format(new Date(job.next), "MMM d, h:mm a")
                        : job.pattern || `Every ${Math.round((job.every || 0) / 60000)}min`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-card/80 backdrop-blur-sm border-border/80 rounded-xl shadow-sm"
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
            <SelectTrigger className="w-[200px] h-11 rounded-xl bg-card border-border/80 shadow-sm">
              <MapPin className="size-4 mr-2 text-muted-foreground" />
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
            <SelectTrigger className="w-[150px] h-11 rounded-xl bg-card border-border/80 shadow-sm">
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
            <Calendar className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                setPage(1)
              }}
              className="pl-10 w-[180px] h-11 bg-card/80 border-border/80 rounded-xl shadow-sm"
            />
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            className="h-11 w-11 rounded-xl border-border/80 bg-card shadow-sm hover:bg-accent"
          >
            <RefreshCw className="size-4 text-muted-foreground" />
          </Button>
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
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
              <h3 className="text-lg font-medium text-foreground">
                Failed to load attendance
              </h3>
              <p className="text-muted-foreground mt-1">
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
              <Clock className="size-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">
                No attendance records
              </h3>
              <p className="text-muted-foreground mt-1">
                {selectedLocationId === "all"
                  ? "Select a location to view attendance"
                  : "No entries found for this date and location"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80">
                    <TableHead className="font-semibold text-muted-foreground">Worker</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Clock In</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Clock Out</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Duration</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Approval</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry: TimeEntry) => (
                    <TableRow key={entry.id} className="hover:bg-accent/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            firstName={entry.user?.firstName}
                            lastName={entry.user?.lastName}
      
                            seed={entry.user?.id}
                            size="md"
                          />
                          <div>
                            <p className="font-medium text-foreground">
                              {entry.user?.firstName} {entry.user?.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
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
                          <p className="font-medium text-foreground">
                            {formatTime(entry.clockInAt)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(toDate(entry.clockInAt), "MMM d")}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.clockOutAt ? (
                          <div>
                            <p className="font-medium text-foreground">
                              {formatTime(entry.clockOutAt)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(toDate(entry.clockOutAt), "MMM d")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">
                          {formatDurationMinutes(entry.totalMinutes)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {entry.approvalStatus === "AUTO" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                              <CheckCircle2 className="size-3.5" />
                              Auto-Approved
                            </span>
                          ) : entry.approvalStatus === "APPROVED" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium">
                              <CheckCircle2 className="size-3.5" />
                              Approved
                            </span>
                          ) : entry.approvalStatus === "REJECTED" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                              <XCircle className="size-3.5" />
                              Rejected
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                              <Clock className="size-3.5" />
                              Pending
                            </span>
                          )}
                          <FlagReasonBadges reasons={entry.flagReasons} />
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.notes ? (
                          <span
                            className="text-sm text-muted-foreground truncate max-w-[150px] block"
                            title={entry.notes}
                          >
                            {entry.notes}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * limit + 1} to{" "}
                    {Math.min(page * limit, meta.total)} of {meta.total} entries
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
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
            <ReportsTab locations={locations} canAccess={canAccess} />
          </TabsContent>

          {/* Approvals Tab */}
          <TabsContent value="approvals" className="mt-6">
            <div className="bg-card rounded-2xl border border-border/60 shadow-sm">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Pending Approvals</h2>
                    <p className="text-sm text-muted-foreground mt-1">
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
                  <h3 className="text-lg font-medium text-foreground">All caught up!</h3>
                  <p className="text-muted-foreground mt-1">No pending approvals at this time</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/80">
                      <TableHead className="font-semibold text-muted-foreground">Worker</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Location</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Date</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Clock In</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Clock Out</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Duration</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Reason</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingApprovalsData.data.map((entry: TimeEntry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              firstName={entry.user?.firstName}
                              lastName={entry.user?.lastName}
        
                              seed={entry.user?.id}
                              size="md"
                            />
                            <p className="font-medium text-foreground">
                              {entry.user?.firstName} {entry.user?.lastName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{entry.location?.name || "Unknown"}</TableCell>
                        <TableCell>{format(toDate(entry.clockInAt), "MMM d, yyyy")}</TableCell>
                        <TableCell>{formatTime(entry.clockInAt)}</TableCell>
                        <TableCell>{entry.clockOutAt ? formatTime(entry.clockOutAt) : "-"}</TableCell>
                        <TableCell className="font-medium">{formatDurationMinutes(entry.totalMinutes)}</TableCell>
                        <TableCell>
                          <FlagReasonBadges reasons={entry.flagReasons} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => approveEntry.mutate(entry.id)}
                              disabled={approveEntry.isPending}
                              className="rounded-lg bg-foreground text-background hover:bg-foreground/90"
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
                              className="rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
                  value={formatDurationMinutes(breakSummary.totalBreakMinutes)}
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
              <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-6 mb-6">
                <h3 className="text-md font-semibold text-foreground mb-4">Breaks by Type</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-amber-50 dark:bg-amber-500/10 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <UtensilsCrossed className="size-5 text-amber-600" />
                      <p className="font-medium text-amber-900 dark:text-amber-300">Lunch Breaks</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-amber-900 dark:text-amber-300">{breakSummary.breaksByType?.LUNCH?.count || 0}</p>
                        <p className="text-xs text-amber-600">Count</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-amber-900 dark:text-amber-300">{formatDurationMinutes(breakSummary.breaksByType?.LUNCH?.totalMinutes || 0)}</p>
                        <p className="text-xs text-amber-600">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-amber-900 dark:text-amber-300">{breakSummary.breaksByType?.LUNCH?.averageMinutes || 0}m</p>
                        <p className="text-xs text-amber-600">Avg</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Coffee className="size-5 text-blue-600" />
                      <p className="font-medium text-blue-900 dark:text-blue-300">Short Breaks</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-blue-900 dark:text-blue-300">{breakSummary.breaksByType?.SHORT?.count || 0}</p>
                        <p className="text-xs text-blue-600">Count</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-blue-900 dark:text-blue-300">{formatDurationMinutes(breakSummary.breaksByType?.SHORT?.totalMinutes || 0)}</p>
                        <p className="text-xs text-blue-600">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-blue-900 dark:text-blue-300">{breakSummary.breaksByType?.SHORT?.averageMinutes || 0}m</p>
                        <p className="text-xs text-blue-600">Avg</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-muted rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Pause className="size-5 text-muted-foreground" />
                      <p className="font-medium text-foreground">Other Breaks</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-foreground">{breakSummary.breaksByType?.OTHER?.count || 0}</p>
                        <p className="text-xs text-muted-foreground">Count</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">{formatDurationMinutes(breakSummary.breaksByType?.OTHER?.totalMinutes || 0)}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">{breakSummary.breaksByType?.OTHER?.averageMinutes || 0}m</p>
                        <p className="text-xs text-muted-foreground">Avg</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Active Breaks Section */}
            <div className="bg-card rounded-2xl border border-border/60 shadow-sm mb-6">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600">
                      <Coffee className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Active Breaks</h2>
                      <p className="text-sm text-muted-foreground">
                        Workers currently on break
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
                  <h3 className="text-lg font-medium text-foreground">No active breaks</h3>
                  <p className="text-muted-foreground mt-1">All workers are currently working</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {activeBreaks.map((breakItem: Break) => (
                    <div key={breakItem.id} className="p-4 flex items-center justify-between hover:bg-accent">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "size-10 rounded-full flex items-center justify-center",
                          breakItem.type === "LUNCH" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                          breakItem.type === "SHORT" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                          "bg-muted text-muted-foreground"
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
                          <p className="font-medium text-foreground">
                            {breakItem.user?.firstName} {breakItem.user?.lastName}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="capitalize">{breakItem.type.toLowerCase()} break</span>
                            <span>•</span>
                            <span>Started {formatTime(breakItem.startedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full",
                          "bg-orange-50 dark:bg-orange-500/10 text-orange-700 border border-orange-200"
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
                            className="rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
            <div className="bg-card rounded-2xl border border-border/60 shadow-sm">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Break History</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      View past break records
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Break Type Filter */}
                    <Select
                      value={breakTypeFilter}
                      onValueChange={setBreakTypeFilter}
                    >
                      <SelectTrigger className="w-[130px] h-10 rounded-lg bg-card border-border/80 shadow-sm">
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
                      <Calendar className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        type="date"
                        value={breakDate}
                        onChange={(e) => setBreakDate(e.target.value)}
                        className="pl-9 w-[160px] h-10 bg-card/80 border-border/80 rounded-lg shadow-sm"
                      />
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => refetchBreakHistory()}
                      className="h-10 w-10 rounded-lg border-border/80 bg-card shadow-sm hover:bg-accent"
                    >
                      <RefreshCw className="size-4 text-muted-foreground" />
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
                  <Coffee className="size-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground">No break records</h3>
                  <p className="text-muted-foreground mt-1">No breaks found for the selected date</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/80">
                      <TableHead className="font-semibold text-muted-foreground">Worker</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Type</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Started</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Ended</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Duration</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakHistoryData.data.map((breakItem: Break) => (
                      <TableRow key={breakItem.id} className="hover:bg-accent/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              firstName={breakItem.user?.firstName}
                              lastName={breakItem.user?.lastName}
        
                              seed={breakItem.user?.id}
                              size="md"
                            />
                            <span className="font-medium text-foreground">
                              {breakItem.user?.firstName} {breakItem.user?.lastName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border",
                            breakItem.type === "LUNCH" ? "bg-amber-500/10 text-amber-700 border-amber-200" :
                            breakItem.type === "SHORT" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200" :
                            "bg-muted text-foreground border-border"
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
                        <TableCell className="text-foreground">{formatTime(breakItem.startedAt)}</TableCell>
                        <TableCell className="text-foreground">
                          {breakItem.endedAt ? formatTime(breakItem.endedAt) : (
                            <span className="text-orange-600">On break</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {formatDurationMinutes(breakItem.durationMinutes)}
                        </TableCell>
                        <TableCell>
                          {breakItem.notes ? (
                            <span className="text-sm text-muted-foreground truncate max-w-[150px] block" title={breakItem.notes}>
                              {breakItem.notes}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
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
