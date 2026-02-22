"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Users,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import {
  joinRequestsApi,
  JoinRequestStatus,
  TechnicianType,
  WorkMode,
  type JoinRequest,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: JoinRequestStatus.PENDING, label: "Pending" },
  { value: JoinRequestStatus.APPROVED, label: "Approved" },
  { value: JoinRequestStatus.REJECTED, label: "Rejected" },
  { value: JoinRequestStatus.CANCELED, label: "Canceled" },
] as const

const SPECIALTY_OPTIONS = [
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "mechanical", label: "Mechanical" },
  { value: "hvac", label: "HVAC" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
] as const

function getStatusBadge(status: JoinRequestStatus) {
  switch (status) {
    case JoinRequestStatus.PENDING:
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>
    case JoinRequestStatus.APPROVED:
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Approved</Badge>
    case JoinRequestStatus.REJECTED:
      return <Badge className="bg-red-100 text-red-600 hover:bg-red-100">Rejected</Badge>
    case JoinRequestStatus.CANCELED:
      return <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100">Canceled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function JoinRequestsPage() {
  const queryClient = useQueryClient()

  // Filter & pagination
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const limit = 10

  // Dialog states
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<JoinRequest | null>(null)

  // Approve form state
  const [approveRole, setApproveRole] = useState<"DISPATCHER" | "TECHNICIAN">("TECHNICIAN")
  const [approvePlatform, setApprovePlatform] = useState<string>("")
  const [approveTechnicianType, setApproveTechnicianType] = useState<string>("")
  const [approveWorkMode, setApproveWorkMode] = useState<string>("")
  const [approveSpecialty, setApproveSpecialty] = useState<string>("")
  const [approveMaxDailyJobs, setApproveMaxDailyJobs] = useState("")

  // Reject form state
  const [rejectReason, setRejectReason] = useState("")

  // Build query params
  const queryParams = useMemo(() => ({
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    limit,
  }), [statusFilter, page, limit])

  // Fetch join requests
  const { data: requestsData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["join-requests", queryParams],
    queryFn: () => joinRequestsApi.list(queryParams),
  })

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof joinRequestsApi.approve>[1] }) =>
      joinRequestsApi.approve(id, data),
    onSuccess: () => {
      toast.success("Join request approved")
      queryClient.invalidateQueries({ queryKey: ["join-requests"] })
      closeApproveDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to approve join request")
    },
  })

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data?: { reason?: string } }) =>
      joinRequestsApi.reject(id, data),
    onSuccess: () => {
      toast.success("Join request rejected")
      queryClient.invalidateQueries({ queryKey: ["join-requests"] })
      closeRejectDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reject join request")
    },
  })

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }

  const handleApproveClick = (request: JoinRequest) => {
    setSelectedRequest(request)
    setApproveRole("TECHNICIAN")
    setApprovePlatform("")
    setApproveTechnicianType("")
    setApproveWorkMode("")
    setApproveSpecialty("")
    setApproveMaxDailyJobs("")
    setApproveDialogOpen(true)
  }

  const handleRejectClick = (request: JoinRequest) => {
    setSelectedRequest(request)
    setRejectReason("")
    setRejectDialogOpen(true)
  }

  const closeApproveDialog = () => {
    setApproveDialogOpen(false)
    setTimeout(() => setSelectedRequest(null), 200)
  }

  const closeRejectDialog = () => {
    setRejectDialogOpen(false)
    setTimeout(() => setSelectedRequest(null), 200)
  }

  const confirmApprove = () => {
    if (!selectedRequest) return

    const data: Parameters<typeof joinRequestsApi.approve>[1] = {
      role: approveRole,
    }

    if (approveRole === "TECHNICIAN") {
      if (approvePlatform) data.platform = approvePlatform
      if (approveTechnicianType) data.technicianType = approveTechnicianType
      if (approveWorkMode) data.workMode = approveWorkMode
      if (approveSpecialty) data.specialty = approveSpecialty
      if (approveMaxDailyJobs) data.maxDailyJobs = parseInt(approveMaxDailyJobs)
    } else if (approveRole === "DISPATCHER") {
      data.platform = "WEB"
    }

    approveMutation.mutate({ id: selectedRequest.id, data })
  }

  const confirmReject = () => {
    if (!selectedRequest) return
    rejectMutation.mutate({
      id: selectedRequest.id,
      data: rejectReason ? { reason: rejectReason } : undefined,
    })
  }

  // Derived data
  const requests = requestsData?.data || []
  const meta = requestsData?.meta
  const totalPages = meta?.totalPages || 1
  const total = meta?.total || 0

  const startItem = total > 0 ? (page - 1) * limit + 1 : 0
  const endItem = Math.min(page * limit, total)

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Join Requests</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review and manage requests from people wanting to join your organization
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">Failed to load join requests</h3>
            <p className="text-sm text-slate-500 mb-4">{(error as Error)?.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">No join requests found</h3>
            <p className="text-sm text-slate-500">
              {statusFilter !== "all"
                ? "Try adjusting your filter"
                : "No one has requested to join your organization yet"}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested At</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <span className="font-medium text-slate-800">
                        {req.user
                          ? `${req.user.firstName} ${req.user.lastName}`
                          : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-slate-600">
                        {req.user?.email || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {req.message ? (
                        <span className="text-sm text-slate-600 line-clamp-2 max-w-[200px]">
                          {req.message}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">
                        {formatDate(req.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {req.status === JoinRequestStatus.PENDING && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleApproveClick(req)}>
                              <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleRejectClick(req)}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Reject
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
                <div className="text-sm text-slate-500">
                  Showing {startItem} to {endItem} of {total} requests
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-slate-600">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={closeApproveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Join Request</DialogTitle>
            <DialogDescription>
              {selectedRequest?.user && (
                <>
                  Approve <strong>{selectedRequest.user.firstName} {selectedRequest.user.lastName}</strong> ({selectedRequest.user.email}) to join your organization.
                  Choose the role and settings for this user.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Role */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={approveRole}
                onValueChange={(v) => setApproveRole(v as "DISPATCHER" | "TECHNICIAN")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TECHNICIAN">Technician</SelectItem>
                  <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Technician-specific fields */}
            {approveRole === "TECHNICIAN" && (
              <>
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={approvePlatform} onValueChange={setApprovePlatform}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MOBILE">Mobile</SelectItem>
                      <SelectItem value="BOTH">Both (Web & Mobile)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Employment Type</Label>
                  <Select value={approveTechnicianType} onValueChange={setApproveTechnicianType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TechnicianType.FULL_TIME}>Full-Time</SelectItem>
                      <SelectItem value={TechnicianType.FREELANCER}>Freelancer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Work Mode</Label>
                  <Select value={approveWorkMode} onValueChange={setApproveWorkMode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select work mode (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WorkMode.HYBRID}>Hybrid</SelectItem>
                      <SelectItem value={WorkMode.ON_SITE}>On-Site</SelectItem>
                      <SelectItem value={WorkMode.ON_ROAD}>On-Road</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Specialty</Label>
                  <Select value={approveSpecialty} onValueChange={setApproveSpecialty}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select specialty (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPECIALTY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Max Daily Jobs</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 5 (optional)"
                    value={approveMaxDailyJobs}
                    onChange={(e) => setApproveMaxDailyJobs(e.target.value)}
                    min={1}
                    max={20}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeApproveDialog}>
              Cancel
            </Button>
            <Button
              onClick={confirmApprove}
              disabled={approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={closeRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Join Request</DialogTitle>
            <DialogDescription>
              {selectedRequest?.user && (
                <>
                  Reject the request from <strong>{selectedRequest.user.firstName} {selectedRequest.user.lastName}</strong> ({selectedRequest.user.email}).
                  You can optionally provide a reason.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="Provide a reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeRejectDialog}>
              Cancel
            </Button>
            <Button
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
