"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Users,
  Clock,
  AlertCircle,
  Umbrella,
  Check,
  X,
  CalendarDays,
  Filter,
} from "lucide-react"
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  differenceInCalendarDays,
  parseISO,
} from "date-fns"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import {
  techniciansApi,
  type TechnicianAvailability,
  type TimeOffRequest,
  type TimeOffStatus,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type ViewMode = "month" | "week"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const STATUS_CONFIG: Record<TimeOffStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", className: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-700" },
  CANCELED: { label: "Canceled", className: "bg-slate-100 text-slate-500" },
}

type OrgTimeOffRequest = TimeOffRequest & {
  technician: { id: string; firstName: string; lastName: string; email: string; specialty: string | null }
}

// ============================================================================
// TIME-OFF REQUESTS TAB
// ============================================================================

function TimeOffRequestsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<TimeOffStatus | "all">("PENDING")
  const [actionDialog, setActionDialog] = useState<{
    open: boolean
    type: "approve" | "reject"
    request: OrgTimeOffRequest | null
  }>({ open: false, type: "approve", request: null })
  const [rejectionReason, setRejectionReason] = useState("")

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["orgTimeOff", statusFilter],
    queryFn: () => techniciansApi.getOrgTimeOff(statusFilter === "all" ? undefined : statusFilter),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, approved, reason }: { id: string; approved: boolean; reason?: string }) =>
      techniciansApi.approveTimeOff(id, approved, reason),
    onSuccess: (_, variables) => {
      toast.success(variables.approved ? "Time-off request approved" : "Time-off request rejected")
      queryClient.invalidateQueries({ queryKey: ["orgTimeOff"] })
      queryClient.invalidateQueries({ queryKey: ["technicians-availability"] })
      setActionDialog({ open: false, type: "approve", request: null })
      setRejectionReason("")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to process request")
    },
  })

  const openAction = useCallback((type: "approve" | "reject", request: OrgTimeOffRequest) => {
    setActionDialog({ open: true, type, request })
    setRejectionReason("")
  }, [])

  const confirmAction = useCallback(() => {
    if (!actionDialog.request) return
    approveMutation.mutate({
      id: actionDialog.request.id,
      approved: actionDialog.type === "approve",
      reason: actionDialog.type === "reject" ? rejectionReason || undefined : undefined,
    })
  }, [actionDialog, rejectionReason, approveMutation])

  const getDuration = useCallback((start: string, end: string) => {
    const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1
    return `${days}d`
  }, [])

  const pendingCount = useMemo(
    () => requests.filter((r: OrgTimeOffRequest) => r.status === "PENDING").length,
    [requests]
  )

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {pendingCount > 0 ? (
            <><span className="font-medium text-amber-600">{pendingCount} pending</span> request{pendingCount !== 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} review</>
          ) : (
            "No pending requests"
          )}
        </p>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TimeOffStatus | "all")}>
          <SelectTrigger className="w-[160px] bg-white">
            <Filter className="h-3.5 w-3.5 mr-2 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Requests</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="CANCELED">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Umbrella className="h-10 w-10 text-slate-200 mb-3" strokeWidth={1.5} />
            <p className="text-sm font-medium text-slate-600">No time-off requests</p>
            <p className="text-[13px] text-slate-400 mt-1">
              {statusFilter !== "all"
                ? `No ${statusFilter.toLowerCase()} requests found`
                : "Requests from technicians will appear here"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="font-medium">Technician</TableHead>
                <TableHead className="font-medium">Dates</TableHead>
                <TableHead className="font-medium">Duration</TableHead>
                <TableHead className="font-medium">Reason</TableHead>
                <TableHead className="font-medium">Status</TableHead>
                <TableHead className="font-medium">Submitted</TableHead>
                {canManage && <TableHead className="font-medium text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requests as OrgTimeOffRequest[]).map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Link href={`/technicians/${request.technician.id}`} className="hover:underline">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-600">
                          {request.technician.firstName[0]}{request.technician.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {request.technician.firstName} {request.technician.lastName}
                          </p>
                          {request.technician.specialty && (
                            <p className="text-xs text-slate-400">{request.technician.specialty}</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                      {format(parseISO(request.startDate), "MMM d")}
                      {request.startDate !== request.endDate && (
                        <> &ndash; {format(parseISO(request.endDate), "MMM d, yyyy")}</>
                      )}
                      {request.startDate === request.endDate && (
                        <>, {format(parseISO(request.startDate), "yyyy")}</>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-600">{getDuration(request.startDate, request.endDate)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-500 max-w-[200px] truncate block">
                      {request.reason || <span className="text-slate-300 italic">No reason</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("font-medium", STATUS_CONFIG[request.status].className)}>
                      {STATUS_CONFIG[request.status].label}
                    </Badge>
                    {request.status === "REJECTED" && request.rejectionReason && (
                      <p className="text-xs text-red-400 mt-1 max-w-[160px] truncate" title={request.rejectionReason}>
                        {request.rejectionReason}
                      </p>
                    )}
                    {request.approvedBy && (
                      <p className="text-xs text-slate-400 mt-1">
                        by {request.approvedBy.firstName} {request.approvedBy.lastName}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-400">{format(parseISO(request.createdAt), "MMM d, yyyy")}</span>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {request.status === "PENDING" ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                            onClick={() => openAction("approve", request)}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            onClick={() => openAction("reject", request)}
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">&mdash;</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Approve/Reject Dialog */}
      <AlertDialog
        open={actionDialog.open}
        onOpenChange={(open) => {
          if (!open) setActionDialog({ open: false, type: "approve", request: null })
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog.type === "approve" ? "Approve" : "Reject"} Time Off Request
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {actionDialog.type === "approve" ? "Approve" : "Reject"} time-off request from{" "}
                  <span className="font-medium text-slate-700">
                    {actionDialog.request?.technician.firstName} {actionDialog.request?.technician.lastName}
                  </span>?
                </p>
                {actionDialog.request && (
                  <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                    <p className="text-slate-600">
                      <span className="font-medium">Dates:</span>{" "}
                      {format(parseISO(actionDialog.request.startDate), "MMM d, yyyy")}
                      {actionDialog.request.startDate !== actionDialog.request.endDate && (
                        <> &ndash; {format(parseISO(actionDialog.request.endDate), "MMM d, yyyy")}</>
                      )}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium">Duration:</span>{" "}
                      {getDuration(actionDialog.request.startDate, actionDialog.request.endDate)}
                    </p>
                    {actionDialog.request.reason && (
                      <p className="text-slate-600">
                        <span className="font-medium">Reason:</span> {actionDialog.request.reason}
                      </p>
                    )}
                  </div>
                )}
                {actionDialog.type === "reject" && (
                  <div className="space-y-2">
                    <Label htmlFor="rejection-reason">Reason for rejection (optional)</Label>
                    <Textarea
                      id="rejection-reason"
                      placeholder="Explain why this request is being rejected..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                actionDialog.type === "approve"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              )}
              onClick={confirmAction}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending
                ? "Processing..."
                : actionDialog.type === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ============================================================================
// CALENDAR TAB
// ============================================================================

function CalendarTab({
  currentDate,
  viewMode,
  selectedTechnician,
  availabilityByDate,
  isInitialLoad,
  isFetchingNew,
}: {
  currentDate: Date
  viewMode: ViewMode
  selectedTechnician: string
  availabilityByDate: Map<string, TechnicianAvailability[]>
  isInitialLoad: boolean
  isFetchingNew: boolean
}) {
  const [selectedDay, setSelectedDay] = useState<{ date: Date; technicians: TechnicianAvailability[] } | null>(null)

  const days = useMemo(() => {
    if (viewMode === "week") {
      return eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) })
    }
    const start = startOfMonth(currentDate)
    const end = endOfMonth(currentDate)
    return eachDayOfInterval({ start: startOfWeek(start), end: endOfWeek(end) })
  }, [currentDate, viewMode])

  // Pre-compute day data to avoid recalculating in render
  const dayDataMap = useMemo(() => {
    const map = new Map<string, { available: number; timeOff: number; notScheduled: number; total: number; technicians: TechnicianAvailability[] }>()
    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd")
      const dayTechnicians = availabilityByDate.get(dateStr) || []
      const relevant = dayTechnicians.filter(t => t.schedule || t.onTimeOff)
      const filtered = selectedTechnician === "all" ? relevant : relevant.filter(t => t.id === selectedTechnician)
      map.set(dateStr, {
        available: filtered.filter(t => t.isAvailable).length,
        timeOff: filtered.filter(t => t.onTimeOff).length,
        notScheduled: filtered.filter(t => !t.isAvailable && !t.onTimeOff).length,
        total: filtered.length,
        technicians: filtered,
      })
    }
    return map
  }, [days, availabilityByDate, selectedTechnician])

  const handleDayClick = useCallback((day: Date, technicians: TechnicianAvailability[]) => {
    if (technicians.length === 0) return
    setSelectedDay({ date: day, technicians })
  }, [])

  return (
    <>
      <div className={cn(
        "bg-white rounded-2xl border border-slate-200/60 shadow-md overflow-hidden mb-6 transition-all duration-300",
        isFetchingNew && "opacity-50 pointer-events-none"
      )}>
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {WEEKDAYS.map((day, i) => (
            <div
              key={day}
              className={cn(
                "text-center text-xs font-semibold uppercase tracking-wider py-3.5",
                i === 0 || i === 6 ? "text-slate-400" : "text-slate-500"
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        {isInitialLoad ? (
          <div className="grid grid-cols-7">
            {Array.from({ length: viewMode === "week" ? 7 : 35 }).map((_, i) => (
              <div key={i} className={cn("bg-white p-3 border-r border-b border-slate-50 last:border-r-0", viewMode === "week" ? "min-h-28" : "min-h-24")}>
                <Skeleton className="h-6 w-6 rounded-full mb-3" />
                <Skeleton className="h-5 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd")
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isTodayDate = isToday(day)
              const data = dayDataMap.get(dateStr)!
              const hasData = data.total > 0
              const isSelected = selectedDay && format(selectedDay.date, "yyyy-MM-dd") === dateStr

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => handleDayClick(day, data.technicians)}
                  className={cn(
                    "p-3 transition-all duration-150 border-r border-b border-slate-50 last:border-r-0",
                    viewMode === "week" ? "min-h-28" : "min-h-24",
                    !isCurrentMonth && "bg-slate-50/30",
                    hasData && "cursor-pointer",
                    isSelected
                      ? "bg-blue-50 ring-2 ring-inset ring-blue-400/50"
                      : isTodayDate
                      ? "bg-blue-50/40 ring-1 ring-inset ring-blue-200/50"
                      : hasData ? "hover:bg-slate-50/80" : ""
                  )}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      "text-sm font-semibold leading-none",
                      !isCurrentMonth && "text-slate-300",
                      isCurrentMonth && !isTodayDate && "text-slate-800",
                      isTodayDate && "bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs shadow-sm"
                    )}>
                      {format(day, "d")}
                    </span>
                    {isTodayDate && (
                      <span className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">Today</span>
                    )}
                  </div>

                  {/* Summary bars */}
                  {hasData && (
                    <div className="space-y-1.5">
                      {data.available > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${(data.available / data.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-emerald-600 min-w-[14px] text-right">{data.available}</span>
                        </div>
                      )}
                      {data.timeOff > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${(data.timeOff / data.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-amber-600 min-w-[14px] text-right">{data.timeOff}</span>
                        </div>
                      )}
                      {data.notScheduled > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-slate-300 rounded-full"
                              style={{ width: `${(data.notScheduled / data.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-slate-400 min-w-[14px] text-right">{data.notScheduled}</span>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 pt-0.5">
                        {data.total} technician{data.total !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Day Detail Panel */}
      {selectedDay && (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-md overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">
                {format(selectedDay.date, "EEEE, MMMM d, yyyy")}
              </h3>
              <Badge variant="secondary" className="text-xs">
                {selectedDay.technicians.length} technician{selectedDay.technicians.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDay(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
            {selectedDay.technicians.map((tech) => (
              <Link
                key={tech.id}
                href={`/technicians/${tech.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                    tech.onTimeOff ? "bg-amber-100 text-amber-700"
                      : tech.isAvailable ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  )}>
                    {tech.firstName.charAt(0)}{tech.lastName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{tech.firstName} {tech.lastName}</p>
                    <p className={cn(
                      "text-xs",
                      tech.onTimeOff ? "text-amber-600"
                        : tech.isAvailable ? "text-emerald-600"
                        : "text-slate-400"
                    )}>
                      {tech.onTimeOff
                        ? `Time Off${tech.timeOff?.reason ? ` — ${tech.timeOff.reason}` : ""}`
                        : tech.schedule
                        ? `${tech.schedule.startTime} - ${tech.schedule.endTime}${tech.schedule.notes ? ` · ${tech.schedule.notes}` : ""}`
                        : "Not scheduled"}
                    </p>
                  </div>
                </div>
                <Badge className={cn(
                  "text-[11px]",
                  tech.onTimeOff ? "bg-amber-100 text-amber-700"
                    : tech.isAvailable ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                )}>
                  {tech.onTimeOff ? "Time Off" : tech.isAvailable ? "Available" : "Unavailable"}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ScheduleAndTimeOffPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab") === "time-off" ? "time-off" : "calendar"
  const [activeTab, setActiveTab] = useState(initialTab)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [selectedTechnician, setSelectedTechnician] = useState<string>("all")

  // Calculate date range for calendar
  const dateRange = useMemo(() => {
    const days = viewMode === "week"
      ? eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) })
      : (() => {
          const start = startOfMonth(currentDate)
          const end = endOfMonth(currentDate)
          return eachDayOfInterval({ start: startOfWeek(start), end: endOfWeek(end) })
        })()
    return {
      start: format(days[0]!, "yyyy-MM-dd"),
      end: format(days[days.length - 1]!, "yyyy-MM-dd"),
    }
  }, [currentDate, viewMode])

  // Fetch availability (only when calendar tab is active or for summary)
  const availabilityQuery = useQuery({
    queryKey: ["technicians-availability", dateRange.start, dateRange.end],
    queryFn: () => techniciansApi.getAvailabilityRange(dateRange.start, dateRange.end),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  // Fetch pending time-off count (lightweight, always loaded for badge)
  const { data: pendingTimeOff = [] } = useQuery({
    queryKey: ["orgTimeOff", "PENDING"],
    queryFn: () => techniciansApi.getOrgTimeOff("PENDING"),
    staleTime: 30000,
  })

  // Build availability map
  const availabilityByDate = useMemo(() => {
    const map = new Map<string, TechnicianAvailability[]>()
    if (availabilityQuery.data) {
      for (const dayData of availabilityQuery.data) {
        map.set(dayData.date, dayData.technicians)
      }
    }
    return map
  }, [availabilityQuery.data])

  // Unique technicians for filter
  const allTechnicians = useMemo(() => {
    const techMap = new Map<string, { id: string; firstName: string; lastName: string }>()
    availabilityByDate.forEach(techs => {
      techs.forEach(t => {
        if (!techMap.has(t.id)) {
          techMap.set(t.id, { id: t.id, firstName: t.firstName, lastName: t.lastName })
        }
      })
    })
    return Array.from(techMap.values())
  }, [availabilityByDate])

  // Today summary
  const todaySummary = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd")
    const todayData = availabilityByDate.get(todayStr)
    if (!todayData) return { total: 0, available: 0, onTimeOff: 0 }
    const scheduled = todayData.filter(t => t.schedule || t.onTimeOff)
    return {
      total: scheduled.length,
      available: scheduled.filter(t => t.isAvailable).length,
      onTimeOff: scheduled.filter(t => t.onTimeOff).length,
    }
  }, [availabilityByDate])

  // Navigation
  const handlePrevious = () => setCurrentDate(viewMode === "week" ? subWeeks(currentDate, 1) : subMonths(currentDate, 1))
  const handleNext = () => setCurrentDate(viewMode === "week" ? addWeeks(currentDate, 1) : addMonths(currentDate, 1))
  const handleToday = () => setCurrentDate(new Date())

  const headerTitle = useMemo(() => {
    if (viewMode === "week") {
      const start = startOfWeek(currentDate)
      const end = endOfWeek(currentDate)
      return start.getMonth() === end.getMonth()
        ? `${format(start, "MMM d")} - ${format(end, "d, yyyy")}`
        : `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`
    }
    return format(currentDate, "MMMM yyyy")
  }, [currentDate, viewMode])

  const canManage = user?.role === "ADMIN" || user?.role === "DISPATCHER"

  if (!canManage) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-12 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">Access Denied</h3>
            <p className="text-sm text-slate-500">You don&apos;t have permission to view this page.</p>
          </div>
        </div>
      </div>
    )
  }

  const pendingCount = pendingTimeOff.length

  return (
    <TooltipProvider>
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          {/* Page Header */}
          <div className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
                  Schedule & Time Off
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Manage technician availability, schedules, and time-off requests
                </p>
              </div>
              {activeTab === "calendar" && (
                <div className="flex items-center gap-3">
                  <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                    <SelectTrigger className="w-[120px] h-10 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                    <SelectTrigger className="w-[180px] h-10 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                      <SelectValue placeholder="All technicians" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Technicians</SelectItem>
                      {allTechnicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id}>
                          {tech.firstName} {tech.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={handleToday} className="h-10 px-4 rounded-xl bg-white/80 shadow-sm">
                    Today
                  </Button>
                  <Button variant="outline" size="icon" onClick={handlePrevious} className="h-10 w-10 rounded-xl bg-white/80 shadow-sm">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-semibold text-slate-700 min-w-36 text-center">{headerTitle}</span>
                  <Button variant="outline" size="icon" onClick={handleNext} className="h-10 w-10 rounded-xl bg-white/80 shadow-sm">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total Technicians</p>
                  <p className="text-2xl font-bold text-slate-900">{todaySummary.total}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-green-100 flex items-center justify-center">
                  <Check className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Available Today</p>
                  <p className="text-2xl font-bold text-slate-900">{todaySummary.available}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Umbrella className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">On Time-Off Today</p>
                  <p className="text-2xl font-bold text-slate-900">{todaySummary.onTimeOff}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-white border border-slate-200/80 shadow-sm mb-6">
              <TabsTrigger value="calendar" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="time-off" className="gap-2">
                <Umbrella className="h-4 w-4" />
                Time Off Requests
                {pendingCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-amber-500 text-white text-[11px] font-bold px-1.5">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calendar">
              <CalendarTab
                currentDate={currentDate}
                viewMode={viewMode}
                selectedTechnician={selectedTechnician}
                availabilityByDate={availabilityByDate}
                isInitialLoad={availabilityQuery.isLoading}
                isFetchingNew={availabilityQuery.isFetching && !availabilityQuery.isLoading}
              />
              {/* Legend */}
              <div className="flex items-center justify-center gap-8 text-xs text-slate-500 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>Time Off</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  <span>Not Scheduled</span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="time-off">
              <TimeOffRequestsTab canManage={canManage} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  )
}
