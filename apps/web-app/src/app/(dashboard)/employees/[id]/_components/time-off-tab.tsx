"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format, differenceInCalendarDays } from "date-fns"
import type { DateRange } from "react-day-picker"
import {
  Umbrella,
  Plus,
  MoreHorizontal,
  Check,
  X,
  CalendarDays,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"

import {
  employeesApi,
  type TimeOffRequest,
  type TimeOffStatus,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
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

const STATUS_BADGES: Record<
  TimeOffStatus,
  { labelKey: string; className: string }
> = {
  PENDING: { labelKey: "common.pending", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  APPROVED: { labelKey: "common.approved", className: "bg-green-500/15 text-green-600 dark:text-green-400" },
  REJECTED: { labelKey: "common.rejected", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  CANCELED: { labelKey: "common.canceled", className: "bg-muted text-muted-foreground" },
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
  })

  const requestMutation = useMutation({
    mutationFn: (data: {
      startDate: string
      endDate: string
      reason?: string
    }) => employeesApi.requestTimeOff(employeeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["employeeTimeOff", employeeId],
      })
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
      queryClient.invalidateQueries({
        queryKey: ["employeeTimeOff", employeeId],
      })
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
      queryClient.invalidateQueries({
        queryKey: ["employeeTimeOff", employeeId],
      })
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
      queryClient.invalidateQueries({
        queryKey: ["employeeTimeOff", employeeId],
      })
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
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('technicians.timeOffTab.title')}</CardTitle>
              <CardDescription>
                {t('technicians.timeOffTab.description')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
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
        </CardHeader>
        <CardContent>
          {timeOffRequests && timeOffRequests.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('technicians.timeOffTab.datesColumn')}</TableHead>
                  <TableHead>{t('technicians.timeOffTab.durationColumn')}</TableHead>
                  <TableHead>{t('technicians.timeOffTab.reasonColumn')}</TableHead>
                  <TableHead>{t('technicians.timeOffTab.statusColumn')}</TableHead>
                  <TableHead>{t('technicians.timeOffTab.reviewedByColumn')}</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeOffRequests.map((request) => {
                  const badge = STATUS_BADGES[request.status]
                  const isPending = request.status === "PENDING"
                  return (
                    <TableRow key={request.id}>
                      <TableCell>
                        {format(new Date(request.startDate), "MMM d, yyyy")} -{" "}
                        {format(new Date(request.endDate), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {getDurationDays(request.startDate, request.endDate)}{" "}
                        {t('technicians.timeOffTab.days')}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {request.reason || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={badge.className}>
                          {t(badge.labelKey)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {request.approvedBy
                          ? `${request.approvedBy.firstName} ${request.approvedBy.lastName}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {(canManage && isPending) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
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
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Umbrella className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p>{t('technicians.timeOffTab.noRequests')}</p>
            </div>
          )}
        </CardContent>
      </Card>

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
