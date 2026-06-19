import React from "react"
import { format } from "date-fns"
import { cn, formatDurationMinutes } from "@/lib/utils"
import { type TimeEntry, type CompanyLocation } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, CheckCircle2, XCircle, Clock, Settings, Play, Timer, MapPin, RefreshCw, Search, Calendar, Users } from "lucide-react"
import { StatCard, FlagReasonBadges, toDate, formatTime } from "./attendance-helpers"

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

interface TrackingTabProps {
  stats: { active: number; completed: number; autoOut: number; totalHours: number }
  entries: TimeEntry[]
  geofenceViolations: TimeEntry[]
  filteredEntries: TimeEntry[]
  loadingEntries: boolean
  loadingLocations: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  meta?: any
  selectedLocationId: string
  setSelectedLocationId: (v: string) => void
  selectedStatus: string
  setSelectedStatus: (v: string) => void
  selectedDate: string
  setSelectedDate: (v: string) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
  limit: number
  locations: CompanyLocation[]
  schedulerInfo?: any
  triggerAutoClockOut: { mutate: (type: "hourly" | "midnight") => void; isPending: boolean }
  isAdmin: boolean
}

export function TrackingTab({
  stats, entries, geofenceViolations, filteredEntries, loadingEntries, loadingLocations,
  isError, error, refetch, meta,
  selectedLocationId, setSelectedLocationId, selectedStatus, setSelectedStatus,
  selectedDate, setSelectedDate, searchQuery, setSearchQuery,
  page, setPage, limit, locations, schedulerInfo, triggerAutoClockOut, isAdmin,
}: TrackingTabProps) {
  return (
    <>

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
                  {schedulerInfo.repeatableJobs.map((job: any, index: number) => (
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
    </>
  )
}
