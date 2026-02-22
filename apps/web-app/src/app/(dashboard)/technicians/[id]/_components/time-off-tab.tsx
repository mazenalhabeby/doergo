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
import { toast } from "sonner"

import {
  techniciansApi,
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
  { label: string; className: string }
> = {
  PENDING: { label: "Pending", className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", className: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-700" },
  CANCELED: { label: "Canceled", className: "bg-slate-100 text-slate-500" },
}

function getDurationDays(start: string, end: string): number {
  return differenceInCalendarDays(new Date(end), new Date(start)) + 1
}

interface TimeOffTabProps {
  technicianId: string
  canManage: boolean
}

export function TimeOffTab({ technicianId, canManage }: TimeOffTabProps) {
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
      "technicianTimeOff",
      technicianId,
      statusFilter === "all" ? undefined : statusFilter,
    ],
    queryFn: () =>
      techniciansApi.getTimeOff(
        technicianId,
        statusFilter === "all"
          ? undefined
          : (statusFilter as TimeOffStatus)
      ),
    enabled: !!technicianId,
  })

  const requestMutation = useMutation({
    mutationFn: (data: {
      startDate: string
      endDate: string
      reason?: string
    }) => techniciansApi.requestTimeOff(technicianId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["technicianTimeOff", technicianId],
      })
      setCreateOpen(false)
      setDateRange(undefined)
      setReason("")
      toast.success("Time-off request submitted")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit request")
    },
  })

  const approveMutation = useMutation({
    mutationFn: (timeOffId: string) =>
      techniciansApi.approveTimeOff(timeOffId, true),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["technicianTimeOff", technicianId],
      })
      setApproveTarget(null)
      toast.success("Time-off request approved")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to approve request")
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({
      timeOffId,
      reason,
    }: {
      timeOffId: string
      reason?: string
    }) => techniciansApi.approveTimeOff(timeOffId, false, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["technicianTimeOff", technicianId],
      })
      setRejectTarget(null)
      setRejectionReason("")
      toast.success("Time-off request rejected")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reject request")
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (timeOffId: string) =>
      techniciansApi.cancelTimeOff(timeOffId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["technicianTimeOff", technicianId],
      })
      toast.success("Time-off request canceled")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to cancel request")
    },
  })

  const handleCreateSubmit = () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error("Please select a date range")
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
              <CardTitle>Time Off</CardTitle>
              <CardDescription>
                Manage time-off requests for this technician
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="CANCELED">Canceled</SelectItem>
                </SelectContent>
              </Select>
              {canManage && (
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Request Time Off
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request Time Off</DialogTitle>
                      <DialogDescription>
                        Select dates and optionally provide a reason.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Date Range</Label>
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
                                  Select dates
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
                        <Label>Reason (optional)</Label>
                        <Textarea
                          placeholder="Vacation, personal, medical, etc."
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
                        Cancel
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
                          ? "Submitting..."
                          : "Submit Request"}
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
                  <TableHead>Dates</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewed By</TableHead>
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
                        day(s)
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-slate-500">
                        {request.reason || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={badge.className}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
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
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setRejectTarget(request)}
                              >
                                <X className="h-4 w-4 mr-2 text-red-600" />
                                Reject
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  cancelMutation.mutate(request.id)
                                }
                              >
                                Cancel Request
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
            <div className="text-center py-12 text-slate-500">
              <Umbrella className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>No time-off requests found</p>
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
            <AlertDialogTitle>Approve Time Off</AlertDialogTitle>
            <AlertDialogDescription>
              Approve this time-off request for{" "}
              {approveTarget &&
                `${format(new Date(approveTarget.startDate), "MMM d")} - ${format(new Date(approveTarget.endDate), "MMM d, yyyy")}`}
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                approveTarget && approveMutation.mutate(approveTarget.id)
              }
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
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
            <DialogTitle>Reject Time Off</DialogTitle>
            <DialogDescription>
              Reject the time-off request for{" "}
              {rejectTarget &&
                `${format(new Date(rejectTarget.startDate), "MMM d")} - ${format(new Date(rejectTarget.endDate), "MMM d, yyyy")}`}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Reason (optional)</Label>
            <Textarea
              placeholder="Provide a reason for rejection"
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
              Cancel
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
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
