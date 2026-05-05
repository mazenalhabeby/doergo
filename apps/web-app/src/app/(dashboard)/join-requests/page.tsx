"use client"

import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
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
import { cn } from "@/lib/utils"

const STATUS_OPTIONS_KEYS = [
  { value: "all", labelKey: "common.allStatuses" },
  { value: JoinRequestStatus.PENDING, labelKey: "joinRequests.status.pending" },
  { value: JoinRequestStatus.APPROVED, labelKey: "joinRequests.status.approved" },
  { value: JoinRequestStatus.REJECTED, labelKey: "joinRequests.status.rejected" },
  { value: JoinRequestStatus.CANCELED, labelKey: "joinRequests.status.canceled" },
] as const

const SPECIALTY_OPTIONS = [
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "mechanical", label: "Mechanical" },
  { value: "hvac", label: "HVAC" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
] as const

function getStatusBadge(status: JoinRequestStatus, t: (key: string) => string) {
  switch (status) {
    case JoinRequestStatus.PENDING:
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{t("joinRequests.status.pending")}</Badge>
    case JoinRequestStatus.APPROVED:
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{t("joinRequests.status.approved")}</Badge>
    case JoinRequestStatus.REJECTED:
      return <Badge className="bg-red-100 text-red-600 hover:bg-red-100">{t("joinRequests.status.rejected")}</Badge>
    case JoinRequestStatus.CANCELED:
      return <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100">{t("joinRequests.status.canceled")}</Badge>
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
  const { t } = useTranslation()
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
      toast.success(t("joinRequests.approveDialog.approvedSuccessfully"))
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
      toast.success(t("joinRequests.rejectDialog.rejectedSuccessfully"))
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
      if (approveWorkMode) (data as any).position = approveWorkMode
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
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                {t("joinRequests.title")}
              </h1>
              <p className="mt-1.5 text-slate-500">
                {t("joinRequests.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[160px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                  <SelectValue placeholder={t("common.filterByStatus")} />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS_KEYS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Refresh */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-11 w-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all"
              >
                <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>

        {/* Summary */}
        {total > 0 && (
          <div className="mb-4">
            <p className="text-sm text-slate-500">
              {t("joinRequests.showingRange", { start: startItem, end: endItem, total, plural: total !== 1 ? "s" : "" })}
            </p>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-800 mb-2">{t("joinRequests.failedToLoad")}</h3>
              <p className="text-sm text-slate-500 mb-4">{(error as Error)?.message}</p>
              <Button variant="outline" className="rounded-xl" onClick={() => refetch()}>
                {t("common.tryAgain")}
              </Button>
            </div>
          ) : requests.length === 0 ? (
            <div className="p-16 text-center">
              <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-800 mb-2">{t("joinRequests.noRequestsFound")}</h3>
              <p className="text-sm text-slate-400">
                {statusFilter !== "all"
                  ? t("joinRequests.noRequestsFilterHint")
                  : t("joinRequests.noRequestsHint")}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="font-semibold text-slate-600">{t("joinRequests.table.name")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("joinRequests.table.email")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("joinRequests.table.message")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("joinRequests.table.status")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("joinRequests.table.requestedAt")}</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
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
                    <TableCell>{getStatusBadge(req.status, t)}</TableCell>
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
                              {t("joinRequests.approveDialog.approveButton")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleRejectClick(req)}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              {t("joinRequests.rejectDialog.rejectButton")}
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
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">
                  {t("common.page", { page, totalPages })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t("common.previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    {t("common.next")}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={closeApproveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("joinRequests.approveDialog.title")}</DialogTitle>
            <DialogDescription>
              {selectedRequest?.user && t("joinRequests.approveDialog.description", {
                name: `${selectedRequest.user.firstName} ${selectedRequest.user.lastName}`,
                email: selectedRequest.user.email,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Role */}
            <div className="space-y-2">
              <Label>{t("joinRequests.approveDialog.roleLabel")}</Label>
              <Select
                value={approveRole}
                onValueChange={(v) => setApproveRole(v as "DISPATCHER" | "TECHNICIAN")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TECHNICIAN">{t("members.roles.technician")}</SelectItem>
                  <SelectItem value="DISPATCHER">{t("members.roles.dispatcher")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Technician-specific fields */}
            {approveRole === "TECHNICIAN" && (
              <>
                <div className="space-y-2">
                  <Label>{t("joinRequests.approveDialog.platformLabel")}</Label>
                  <Select value={approvePlatform} onValueChange={setApprovePlatform}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("joinRequests.approveDialog.platformPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MOBILE">{t("members.platforms.mobile")}</SelectItem>
                      <SelectItem value="BOTH">{t("members.platforms.webAndMobile")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("joinRequests.approveDialog.employmentTypeLabel")}</Label>
                  <Select value={approveTechnicianType} onValueChange={setApproveTechnicianType}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("joinRequests.approveDialog.employmentTypePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TechnicianType.FULL_TIME}>{t("technicians.types.fullTime")}</SelectItem>
                      <SelectItem value={TechnicianType.FREELANCER}>{t("technicians.types.freelancer")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("joinRequests.approveDialog.workModeLabel")}</Label>
                  <Select value={approveWorkMode} onValueChange={setApproveWorkMode}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("joinRequests.approveDialog.workModePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {approveTechnicianType === TechnicianType.FULL_TIME && (
                        <SelectItem value={"HYBRID"}>{t("technicians.workModes.hybrid")}</SelectItem>
                      )}
                      <SelectItem value={"ON_SITE"}>{t("technicians.workModes.onSite")}</SelectItem>
                      <SelectItem value={"ON_ROAD"}>{t("technicians.workModes.onRoad")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("joinRequests.approveDialog.specialtyLabel")}</Label>
                  <Select value={approveSpecialty} onValueChange={setApproveSpecialty}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("joinRequests.approveDialog.specialtyPlaceholder")} />
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
                  <Label>{t("joinRequests.approveDialog.maxDailyJobsLabel")}</Label>
                  <Input
                    type="number"
                    placeholder={t("joinRequests.approveDialog.maxDailyJobsPlaceholder")}
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
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmApprove}
              disabled={approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {approveMutation.isPending ? t("common.approving") : t("joinRequests.approveDialog.approveButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={closeRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("joinRequests.rejectDialog.title")}</DialogTitle>
            <DialogDescription>
              {selectedRequest?.user && t("joinRequests.rejectDialog.description", {
                name: `${selectedRequest.user.firstName} ${selectedRequest.user.lastName}`,
                email: selectedRequest.user.email,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("joinRequests.rejectDialog.reasonLabel")}</Label>
              <Textarea
                placeholder={t("joinRequests.rejectDialog.reasonPlaceholder")}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeRejectDialog}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {rejectMutation.isPending ? t("common.rejecting") : t("joinRequests.rejectDialog.rejectButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
