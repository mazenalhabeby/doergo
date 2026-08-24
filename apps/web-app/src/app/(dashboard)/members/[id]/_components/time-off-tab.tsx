"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format, differenceInCalendarDays } from "date-fns"
import type { DateRange } from "react-day-picker"
import {
  CalendarOff,
  Plus,
  MoreHorizontal,
  Check,
  X,
  CalendarDays,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"

import { useTimeFormat } from "@/hooks"

import {
  employeesApi,
  type TimeOffRequest,
  type TimeOffStatus,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { invalidateTimeOff } from "@/lib/query-keys"

const STATUS_PILLS: Record<
  TimeOffStatus,
  { labelKey: string; hex: string }
> = {
  PENDING: { labelKey: "common.pending", hex: "#ca8a04" },
  APPROVED: { labelKey: "common.approved", hex: "#16a34a" },
  REJECTED: { labelKey: "common.rejected", hex: "#dc2626" },
  CANCELED: { labelKey: "common.canceled", hex: "#64748b" },
}

function getDurationDays(start: string, end: string): number {
  return differenceInCalendarDays(new Date(end), new Date(start)) + 1
}

interface TimeOffTabProps {
  employeeId: string
  canManage: boolean
}

export function TimeOffTab({ employeeId, canManage }: TimeOffTabProps) {
  const { t } = useTranslation()
  const { formatDate } = useTimeFormat()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<TimeOffRequest | null>(null)
  const [approveTarget, setApproveTarget] = useState<TimeOffRequest | null>(
    null
  )

  // Create form state
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [reason, setReason] = useState("")
  const [rejectionReason, setRejectionReason] = useState("")

  const { data: timeOffRequests, isLoading } = useQuery({
    queryKey: [
      "employeeTimeOff",
      employeeId,
      statusFilter === "all" ? undefined : statusFilter,
    ],
    queryFn: () =>
      employeesApi.getTimeOff(
        employeeId,
        statusFilter === "all"
          ? undefined
          : (statusFilter as TimeOffStatus)
      ),
    enabled: !!employeeId,
    staleTime: 30_000, // avoid refetching on every tab re-open
  })

  const requestMutation = useMutation({
    mutationFn: (data: {
      startDate: string
      endDate: string
      reason?: string
    }) => employeesApi.requestTimeOff(employeeId, data),
    onSuccess: () => {
      invalidateTimeOff(queryClient, employeeId)
      setCreateOpen(false)
      setDateRange(undefined)
      setReason("")
      notify.success(t('technicians.timeOffTab.submittedSuccessfully'))
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.timeOffTab.failedToSubmit'))
    },
  })

  const approveMutation = useMutation({
    mutationFn: (timeOffId: string) =>
      employeesApi.approveTimeOff(timeOffId, true),
    onSuccess: () => {
      invalidateTimeOff(queryClient, employeeId)
      setApproveTarget(null)
      notify.success(t('technicians.timeOffTab.approvedSuccessfully'))
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.timeOffTab.failedToApprove'))
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({
      timeOffId,
      reason,
    }: {
      timeOffId: string
      reason?: string
    }) => employeesApi.approveTimeOff(timeOffId, false, reason),
    onSuccess: () => {
      invalidateTimeOff(queryClient, employeeId)
      setRejectTarget(null)
      setRejectionReason("")
      notify.success(t('technicians.timeOffTab.rejectedSuccessfully'))
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.timeOffTab.failedToReject'))
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (timeOffId: string) =>
      employeesApi.cancelTimeOff(timeOffId),
    onSuccess: () => {
      invalidateTimeOff(queryClient, employeeId)
      notify.success(t('technicians.timeOffTab.canceledSuccessfully'))
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.timeOffTab.failedToCancel'))
    },
  })

  const handleCreateSubmit = () => {
    if (!dateRange?.from || !dateRange?.to) {
      notify.error(t('validation.pleaseSelectDateRange'))
      return
    }
    requestMutation.mutate({
      startDate: format(dateRange.from, "yyyy-MM-dd"),
      endDate: format(dateRange.to, "yyyy-MM-dd"),
      reason: reason || undefined,
    })
  }

  if (isLoading) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="divide-y divide-border/60">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarOff className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('technicians.timeOffTab.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('technicians.timeOffTab.description')}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder={t('common.filterByStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="PENDING">{t('common.pending')}</SelectItem>
                  <SelectItem value="APPROVED">{t('common.approved')}</SelectItem>
                  <SelectItem value="REJECTED">{t('common.rejected')}</SelectItem>
                  <SelectItem value="CANCELED">{t('common.canceled')}</SelectItem>
                </SelectContent>
              </Select>
              {canManage && (
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('technicians.timeOffTab.requestTimeOff')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('technicians.timeOffTab.requestDialog.title')}</DialogTitle>
                      <DialogDescription>
                        {t('technicians.timeOffTab.requestDialog.description')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>{t('technicians.timeOffTab.requestDialog.dateRangeLabel')}</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-start text-left font-normal"
                            >
                              <CalendarDays className="mr-2 h-4 w-4" />
                              {dateRange?.from ? (
                                dateRange.to ? (
                                  <>
                                    {format(dateRange.from, "MMM d, yyyy")} -{" "}
                                    {format(dateRange.to, "MMM d, yyyy")}
                                  </>
                                ) : (
                                  format(dateRange.from, "MMM d, yyyy")
                                )
                              ) : (
                                <span className="text-muted-foreground">
                                  {t('technicians.timeOffTab.requestDialog.selectDates')}
                                </span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="range"
                              selected={dateRange}
                              onSelect={setDateRange}
                              disabled={{ before: new Date() }}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('technicians.timeOffTab.requestDialog.reasonLabel')}</Label>
                        <Textarea
                          placeholder={t('technicians.timeOffTab.requestDialog.reasonPlaceholder')}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setCreateOpen(false)}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button
                        onClick={handleCreateSubmit}
                        disabled={
                          !dateRange?.from ||
                          !dateRange?.to ||
                          requestMutation.isPending
                        }
                      >
                        {requestMutation.isPending
                          ? t('common.submitting')
                          : t('technicians.timeOffTab.requestDialog.submitButton')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
          </div>
        </div>

        {timeOffRequests && timeOffRequests.length > 0 ? (
          <div className="divide-y divide-border/60">
            {timeOffRequests.map((request) => {
              const pill = STATUS_PILLS[request.status]
              const isPending = request.status === "PENDING"
              return (
                <div
                  key={request.id}
                  className="px-5 py-3.5 hover:bg-accent/40 transition-colors flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {formatDate(request.startDate)} - {formatDate(request.endDate)}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex-shrink-0">
                        {getDurationDays(request.startDate, request.endDate)}{" "}
                        {t('technicians.timeOffTab.days')}
                      </span>
                      {request.reason && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="truncate">{request.reason}</span>
                        </>
                      )}
                      {request.approvedBy && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="truncate">
                            {request.approvedBy.firstName} {request.approvedBy.lastName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium flex-shrink-0"
                    style={{ borderColor: `${pill.hex}33`, color: pill.hex, backgroundColor: `${pill.hex}14` }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pill.hex }} />
                    {t(pill.labelKey)}
                  </span>
                  {(canManage && isPending) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="flex-shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setApproveTarget(request)}
                        >
                          <Check className="h-4 w-4 mr-2 text-green-600" />
                          {t('common.approved')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setRejectTarget(request)}
                        >
                          <X className="h-4 w-4 mr-2 text-red-600" />
                          {t('common.rejected')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            cancelMutation.mutate(request.id)
                          }
                        >
                          {t('technicians.timeOffTab.cancelRequest')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
              <CalendarOff className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">{t('technicians.timeOffTab.noRequests')}</p>
          </div>
        )}
      </div>

      {/* Approve Confirmation Dialog */}
      <AlertDialog
        open={!!approveTarget}
        onOpenChange={(open) => !open && setApproveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('technicians.timeOffTab.approveDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {approveTarget && t('technicians.timeOffTab.approveDialog.description', {
                dates: `${format(new Date(approveTarget.startDate), "MMM d")} - ${format(new Date(approveTarget.endDate), "MMM d, yyyy")}`
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                approveTarget && approveMutation.mutate(approveTarget.id)
              }
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? t('common.approving') : t('common.approved')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null)
            setRejectionReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('technicians.timeOffTab.rejectDialog.title')}</DialogTitle>
            <DialogDescription>
              {rejectTarget && t('technicians.timeOffTab.rejectDialog.description', {
                dates: `${format(new Date(rejectTarget.startDate), "MMM d")} - ${format(new Date(rejectTarget.endDate), "MMM d, yyyy")}`
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>{t('technicians.timeOffTab.rejectDialog.reasonLabel')}</Label>
            <Textarea
              placeholder={t('technicians.timeOffTab.rejectDialog.reasonPlaceholder')}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null)
                setRejectionReason("")
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejectTarget &&
                rejectMutation.mutate({
                  timeOffId: rejectTarget.id,
                  reason: rejectionReason || undefined,
                })
              }
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? t('common.rejecting') : t('common.rejected')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
