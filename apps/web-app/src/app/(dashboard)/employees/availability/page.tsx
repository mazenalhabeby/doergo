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
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import {
  employeesApi,
  type EmployeeAvailability,
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
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

type ViewMode = "month" | "week"

const WEEKDAY_KEYS = ["common.weekdaysShort.sun", "common.weekdaysShort.mon", "common.weekdaysShort.tue", "common.weekdaysShort.wed", "common.weekdaysShort.thu", "common.weekdaysShort.fri", "common.weekdaysShort.sat"]

const STATUS_CONFIG: Record<TimeOffStatus, { labelKey: string; className: string }> = {
  PENDING: { labelKey: "common.pending", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  APPROVED: { labelKey: "common.approved", className: "bg-green-500/15 text-green-600 dark:text-green-400" },
  REJECTED: { labelKey: "common.rejected", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  CANCELED: { labelKey: "common.canceled", className: "bg-muted text-muted-foreground" },
}

type OrgTimeOffRequest = TimeOffRequest & {
  technician: { id: string; firstName: string; lastName: string; email: string; specialty: string | null }
}

// ============================================================================
// TIME-OFF REQUESTS TAB
// ============================================================================

function TimeOffRequestsTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
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
    queryFn: () => employeesApi.getOrgTimeOff(statusFilter === "all" ? undefined : statusFilter),
    staleTime: 30_000,
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, approved, reason }: { id: string; approved: boolean; reason?: string }) =>
      employeesApi.approveTimeOff(id, approved, reason),
    onSuccess: (_, variables) => {
      notify.success(variables.approved ? t('technicians.availabilityPage.approvedSuccessfully') : t('technicians.availabilityPage.rejectedSuccessfully'))
      queryClient.invalidateQueries({ queryKey: ["orgTimeOff"] })
      queryClient.invalidateQueries({ queryKey: ["employees-availability"] })
      setActionDialog({ open: false, type: "approve", request: null })
      setRejectionReason("")
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.availabilityPage.failedToProcess'))
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
        <p className="text-sm text-muted-foreground">
          {pendingCount > 0 ? (
            t('technicians.availabilityPage.pendingNeedReview', { count: pendingCount, plural: pendingCount !== 1 ? "s" : "", verb: pendingCount === 1 ? "s" : "" })
          ) : (
            t('technicians.availabilityPage.noPendingRequests')
          )}
        </p>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TimeOffStatus | "all")}>
          <SelectTrigger className="w-[160px] bg-card">
            <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('technicians.availabilityPage.allRequests')}</SelectItem>
            <SelectItem value="PENDING">{t('common.pending')}</SelectItem>
            <SelectItem value="APPROVED">{t('common.approved')}</SelectItem>
            <SelectItem value="REJECTED">{t('common.rejected')}</SelectItem>
            <SelectItem value="CANCELED">{t('common.canceled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Umbrella className="h-10 w-10 text-muted-foreground mb-3" strokeWidth={1.5} />
            <p className="text-sm font-medium text-muted-foreground">{t('technicians.availabilityPage.noTimeOffRequests')}</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              {statusFilter !== "all"
                ? t('technicians.availabilityPage.noRequestsFound', { status: statusFilter.toLowerCase() })
                : t('technicians.availabilityPage.requestsFromTechnicians')}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted">
                <TableHead className="font-medium">{t('technicians.availabilityPage.technicianColumn')}</TableHead>
                <TableHead className="font-medium">{t('technicians.availabilityPage.datesColumn')}</TableHead>
                <TableHead className="font-medium">{t('technicians.availabilityPage.durationColumn')}</TableHead>
                <TableHead className="font-medium">{t('technicians.availabilityPage.reasonColumn')}</TableHead>
                <TableHead className="font-medium">{t('technicians.availabilityPage.statusColumn')}</TableHead>
                <TableHead className="font-medium">{t('technicians.availabilityPage.submittedColumn')}</TableHead>
                {canManage && <TableHead className="font-medium text-right">{t('technicians.availabilityPage.actionsColumn')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requests as OrgTimeOffRequest[]).map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Link href={`/employees/${request.technician.id}`} className="hover:underline">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                          {request.technician.firstName[0]}{request.technician.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {request.technician.firstName} {request.technician.lastName}
                          </p>
                          {request.technician.specialty && (
                            <p className="text-xs text-muted-foreground">{request.technician.specialty}</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
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
                    <span className="text-sm text-muted-foreground">{getDuration(request.startDate, request.endDate)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
                      {request.reason || <span className="text-muted-foreground italic">{t('common.noReason')}</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("font-medium", STATUS_CONFIG[request.status].className)}>
                      {t(STATUS_CONFIG[request.status].labelKey)}
                    </Badge>
                    {request.status === "REJECTED" && request.rejectionReason && (
                      <p className="text-xs text-red-400 mt-1 max-w-[160px] truncate" title={request.rejectionReason}>
                        {request.rejectionReason}
                      </p>
                    )}
                    {request.approvedBy && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('technicians.availabilityPage.byReviewer', { name: `${request.approvedBy.firstName} ${request.approvedBy.lastName}` })}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{format(parseISO(request.createdAt), "MMM d, yyyy")}</span>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {request.status === "PENDING" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openAction("approve", request)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
                          >
                            <Check className="size-3" />
                            {t('technicians.availabilityPage.approve')}
                          </button>
                          <button
                            onClick={() => openAction("reject", request)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <X className="size-3" />
                            {t('technicians.availabilityPage.reject')}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">&mdash;</span>
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
              {actionDialog.type === "approve" ? t('technicians.availabilityPage.approveTimeOffTitle') : t('technicians.availabilityPage.rejectTimeOffTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {actionDialog.type === "approve"
                    ? t('technicians.availabilityPage.approveTimeOffDescription', { name: `${actionDialog.request?.technician.firstName} ${actionDialog.request?.technician.lastName}` })
                    : t('technicians.availabilityPage.rejectTimeOffDescription', { name: `${actionDialog.request?.technician.firstName} ${actionDialog.request?.technician.lastName}` })}
                </p>
                {actionDialog.request && (
                  <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                    <p className="text-muted-foreground">
                      <span className="font-medium">{t('technicians.availabilityPage.datesColumn')}:</span>{" "}
                      {format(parseISO(actionDialog.request.startDate), "MMM d, yyyy")}
                      {actionDialog.request.startDate !== actionDialog.request.endDate && (
                        <> &ndash; {format(parseISO(actionDialog.request.endDate), "MMM d, yyyy")}</>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">{t('technicians.availabilityPage.durationColumn')}:</span>{" "}
                      {getDuration(actionDialog.request.startDate, actionDialog.request.endDate)}
                    </p>
                    {actionDialog.request.reason && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">{t('technicians.availabilityPage.reasonColumn')}:</span> {actionDialog.request.reason}
                      </p>
                    )}
                  </div>
                )}
                {actionDialog.type === "reject" && (
                  <div className="space-y-2">
                    <Label htmlFor="rejection-reason">{t('technicians.availabilityPage.reasonForRejection')}</Label>
                    <Textarea
                      id="rejection-reason"
                      placeholder={t('technicians.availabilityPage.explainRejection')}
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
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
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
                ? t('common.processing')
                : actionDialog.type === "approve" ? t('technicians.availabilityPage.approve') : t('technicians.availabilityPage.reject')}
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
  selectedSpace,
  availabilityByDate,
  isInitialLoad,
  isFetchingNew,
  t,
}: {
  currentDate: Date
  viewMode: ViewMode
  selectedSpace: string
  availabilityByDate: Map<string, EmployeeAvailability[]>
  isInitialLoad: boolean
  isFetchingNew: boolean
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const [selectedDay, setSelectedDay] = useState<{ date: Date; employees: EmployeeAvailability[] } | null>(null)

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
    const map = new Map<string, { available: number; timeOff: number; notScheduled: number; total: number; employees: EmployeeAvailability[] }>()
    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd")
      const dayEmployees = availabilityByDate.get(dateStr) || []
      const relevant = dayEmployees.filter(t => t.schedule || t.onTimeOff)
      const filtered = selectedSpace === "all" ? relevant : relevant.filter(t => (t as any).space?.id === selectedSpace)
      map.set(dateStr, {
        available: filtered.filter(t => t.isAvailable).length,
        timeOff: filtered.filter(t => t.onTimeOff).length,
        notScheduled: filtered.filter(t => !t.isAvailable && !t.onTimeOff).length,
        total: filtered.length,
        employees: filtered,
      })
    }
    return map
  }, [days, availabilityByDate, selectedSpace])

  const handleDayClick = useCallback((day: Date, employees: EmployeeAvailability[]) => {
    if (employees.length === 0) return
    setSelectedDay({ date: day, employees })
  }, [])

  return (
    <>
      <div className={cn(
        "bg-card rounded-2xl border border-border overflow-hidden mb-6 transition-all duration-300",
        isFetchingNew && "opacity-50 pointer-events-none"
      )}>
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAY_KEYS.map((dayKey, i) => (
            <div
              key={dayKey}
              className={cn(
                "text-center text-xs font-semibold uppercase tracking-wider py-3.5",
                i === 0 || i === 6 ? "text-muted-foreground" : "text-muted-foreground"
              )}
            >
              {t(dayKey)}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        {isInitialLoad ? (
          <div className="grid grid-cols-7">
            {Array.from({ length: viewMode === "week" ? 7 : 35 }).map((_, i) => (
              <div key={i} className={cn("bg-card p-3 border-r border-b border-border last:border-r-0", viewMode === "week" ? "min-h-28" : "min-h-24")}>
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
                  onClick={() => handleDayClick(day, data.employees)}
                  className={cn(
                    "p-3 transition-all duration-150 border-r border-b border-border/60 last:border-r-0",
                    viewMode === "week" ? "min-h-28" : "min-h-24",
                    !isCurrentMonth && "bg-muted/50",
                    hasData && "cursor-pointer",
                    isSelected
                      ? "bg-foreground/[0.04] ring-2 ring-inset ring-foreground/20"
                      : isTodayDate
                      ? "bg-foreground/[0.02] ring-1 ring-inset ring-foreground/10"
                      : hasData ? "hover:bg-muted/40" : ""
                  )}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      "text-sm font-semibold leading-none",
                      !isCurrentMonth && "text-muted-foreground/50",
                      isCurrentMonth && !isTodayDate && "text-foreground",
                      isTodayDate && "bg-foreground text-background rounded-full w-7 h-7 flex items-center justify-center text-xs"
                    )}>
                      {format(day, "d")}
                    </span>
                    {isTodayDate && (
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t('common.today')}</span>
                    )}
                  </div>

                  {/* Summary bars */}
                  {hasData && (
                    <div className="space-y-1.5">
                      {data.available > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full" style={{ width: `${(data.available / data.total) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 min-w-[14px] text-right">{data.available}</span>
                        </div>
                      )}
                      {data.timeOff > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-amber-400 dark:bg-amber-500 rounded-full" style={{ width: `${(data.timeOff / data.total) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 min-w-[14px] text-right">{data.timeOff}</span>
                        </div>
                      )}
                      {data.notScheduled > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-muted-foreground/40 rounded-full" style={{ width: `${(data.notScheduled / data.total) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-semibold text-muted-foreground min-w-[14px] text-right">{data.notScheduled}</span>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 pt-0.5">
                        {data.total} {data.total !== 1 ? t('technicians.availabilityPage.techniciansPlural') : t('technicians.availabilityPage.technicians')}
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
        <div className="bg-card rounded-2xl border border-border overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                {format(selectedDay.date, "EEEE, MMMM d, yyyy")}
              </h3>
              <Badge variant="secondary" className="text-xs">
                {selectedDay.employees.length} {selectedDay.employees.length !== 1 ? t('technicians.availabilityPage.techniciansPlural') : t('technicians.availabilityPage.technicians')}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDay(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {(() => {
              // Group employees by space
              const bySpace = new Map<string, { name: string; techs: typeof selectedDay.employees }>()
              const unassigned: typeof selectedDay.employees = []

              for (const tech of selectedDay.employees) {
                const spaceId = (tech as any).space?.id
                const spaceName = (tech as any).space?.name
                if (spaceId && spaceName) {
                  if (!bySpace.has(spaceId)) bySpace.set(spaceId, { name: spaceName, techs: [] })
                  bySpace.get(spaceId)!.techs.push(tech)
                } else {
                  unassigned.push(tech)
                }
              }

              const groups = [...bySpace.entries()]
              if (unassigned.length > 0) groups.push(["__unassigned__", { name: "Unassigned", techs: unassigned }])

              // If no space data, render flat list
              if (groups.length === 0) {
                groups.push(["__all__", { name: "All Workers", techs: selectedDay.employees }])
              }

              return groups.map(([spaceId, { name: spaceName, techs }]) => (
                <div key={spaceId}>
                  {/* Space header */}
                  <div className="flex items-center gap-2 px-5 py-2 bg-muted/40 border-b border-border/40">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{spaceName}</span>
                    <span className="text-[10px] text-muted-foreground/60">{techs.length}</span>
                  </div>
                  {/* Workers in this space */}
                  {techs.map((tech) => (
                    <Link
                      key={tech.id}
                      href={`/members/${tech.id}`}
                      className="flex items-center justify-between px-5 py-2.5 hover:bg-accent/80 transition-colors border-b border-border/20 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold",
                          tech.onTimeOff ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : tech.isAvailable ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {tech.firstName.charAt(0)}{tech.lastName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{tech.firstName} {tech.lastName}</p>
                          <p className={cn(
                            "text-xs",
                            tech.onTimeOff ? "text-amber-600 dark:text-amber-400"
                              : tech.isAvailable ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          )}>
                            {tech.onTimeOff
                              ? `${t('technicians.availabilityPage.timeOffLabel')}${tech.timeOff?.reason ? ` — ${tech.timeOff.reason}` : ""}`
                              : tech.schedule
                              ? `${tech.schedule.startTime} - ${tech.schedule.endTime}${tech.schedule.notes ? ` · ${tech.schedule.notes}` : ""}`
                              : t('technicians.availabilityPage.notScheduled')}
                          </p>
                        </div>
                      </div>
                      <Badge className={cn(
                        "text-[10px]",
                        tech.onTimeOff ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : tech.isAvailable ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {tech.onTimeOff ? t('technicians.availability.timeOff') : tech.isAvailable ? t('technicians.availability.available') : t('technicians.availability.unavailable')}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ))
            })()}
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
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab") === "time-off" ? "time-off" : "calendar"
  const [activeTab, setActiveTab] = useState(initialTab)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [selectedSpace, setSelectedSpace] = useState<string>("all")

  // Fetch locations for space filter
  const { data: locationsData } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { locationsApi } = await import("@/lib/api")
      return locationsApi.list()
    },
    staleTime: 60000,
  })
  const locations = (locationsData as any)?.data || locationsData || []

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
    queryKey: ["employees-availability", dateRange.start, dateRange.end],
    queryFn: () => employeesApi.getAvailabilityRange(dateRange.start, dateRange.end),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  // Fetch pending time-off count (lightweight, always loaded for badge)
  const { data: pendingTimeOff = [] } = useQuery({
    queryKey: ["orgTimeOff", "PENDING"],
    queryFn: () => employeesApi.getOrgTimeOff("PENDING"),
    staleTime: 30000,
  })

  // Build availability map
  const availabilityByDate = useMemo(() => {
    const map = new Map<string, EmployeeAvailability[]>()
    if (availabilityQuery.data) {
      for (const dayData of availabilityQuery.data) {
        map.set(dayData.date, dayData.technicians)
      }
    }
    return map
  }, [availabilityQuery.data])

  // Unique employees for filter
  const allEmployees = useMemo(() => {
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

  // Today summary — respects space filter
  const todaySummary = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd")
    const todayData = availabilityByDate.get(todayStr)
    if (!todayData) return { total: 0, available: 0, onTimeOff: 0 }
    const filtered = selectedSpace === "all"
      ? todayData.filter(t => t.schedule || t.onTimeOff)
      : todayData.filter(t => (t as any).space?.id === selectedSpace && (t.schedule || t.onTimeOff))
    return {
      total: filtered.length,
      available: filtered.filter(t => t.isAvailable).length,
      onTimeOff: filtered.filter(t => t.onTimeOff).length,
    }
  }, [availabilityByDate, selectedSpace])

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

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER"

  if (!canManage) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <div className="bg-card rounded-xl border border-border/80 shadow-sm p-12 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">{t('technicians.availabilityPage.accessDenied')}</h3>
            <p className="text-sm text-muted-foreground">{t('technicians.availabilityPage.noPermission')}</p>
          </div>
        </div>
      </div>
    )
  }

  const pendingCount = pendingTimeOff.length

  return (
    <TooltipProvider>
      <div className="min-h-full bg-background">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          {/* Page Header */}
          <div className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                  {t('technicians.availabilityPage.title')}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('technicians.availabilityPage.subtitle')}
                </p>
              </div>
              {activeTab === "calendar" && (
                <div className="flex items-center gap-3">
                  <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                    <SelectTrigger className="w-[120px] h-10 bg-card/80 backdrop-blur-sm border-border/80 rounded-xl shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">{t('technicians.availabilityPage.weekView')}</SelectItem>
                      <SelectItem value="month">{t('technicians.availabilityPage.monthView')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={selectedSpace} onValueChange={setSelectedSpace}>
                    <SelectTrigger className="w-[180px] h-10 bg-card/80 backdrop-blur-sm border-border/80 rounded-xl shadow-sm">
                      <SelectValue placeholder="All Spaces" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Spaces</SelectItem>
                      {(locations as any[]).map((loc: any) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={handleToday} className="h-10 px-4 rounded-xl bg-card/80 shadow-sm">
                    {t('common.today')}
                  </Button>
                  <Button variant="outline" size="icon" onClick={handlePrevious} className="h-10 w-10 rounded-xl bg-card/80 shadow-sm">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-semibold text-foreground min-w-36 text-center">{headerTitle}</span>
                  <Button variant="outline" size="icon" onClick={handleNext} className="h-10 w-10 rounded-xl bg-card/80 shadow-sm">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Summary Cards — minimal, monochrome */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('technicians.availabilityPage.totalTechnicians')}</p>
              <div className="flex items-baseline gap-2 mt-1.5">
                <p className="text-3xl font-bold text-foreground tabular-nums">{todaySummary.total}</p>
                <p className="text-xs text-muted-foreground">scheduled</p>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('technicians.availabilityPage.availableToday')}</p>
              <div className="flex items-baseline gap-2 mt-1.5">
                <p className="text-3xl font-bold text-foreground tabular-nums">{todaySummary.available}</p>
                {todaySummary.total > 0 && (
                  <p className="text-xs text-muted-foreground">{Math.round((todaySummary.available / todaySummary.total) * 100)}%</p>
                )}
              </div>
              {todaySummary.total > 0 && (
                <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-foreground/70 transition-all duration-500" style={{ width: `${(todaySummary.available / todaySummary.total) * 100}%` }} />
                </div>
              )}
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('technicians.availabilityPage.onTimeOffToday')}</p>
              <div className="flex items-baseline gap-2 mt-1.5">
                <p className={cn("text-3xl font-bold tabular-nums", todaySummary.onTimeOff > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>{todaySummary.onTimeOff}</p>
                {todaySummary.onTimeOff > 0 && (
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/70">off today</p>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-card border border-border/80 shadow-sm mb-6">
              <TabsTrigger value="calendar" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {t('technicians.availabilityPage.calendarTab')}
              </TabsTrigger>
              <TabsTrigger value="time-off" className="gap-2">
                <Umbrella className="h-4 w-4" />
                {t('technicians.availabilityPage.timeOffTab')}
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
                selectedSpace={selectedSpace}
                availabilityByDate={availabilityByDate}
                isInitialLoad={availabilityQuery.isLoading}
                isFetchingNew={availabilityQuery.isFetching && !availabilityQuery.isLoading}
                t={t}
              />
              {/* Legend */}
              <div className="flex items-center justify-center gap-8 text-xs text-muted-foreground py-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>{t('technicians.availabilityPage.legend.available')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>{t('technicians.availabilityPage.legend.timeOff')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
                  <span>{t('technicians.availabilityPage.legend.notScheduled')}</span>
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
