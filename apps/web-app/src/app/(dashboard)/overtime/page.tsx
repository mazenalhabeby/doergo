"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { format, formatDistanceToNow } from "date-fns"
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Timer,
  MapPin,
  User,
  Pen,
} from "lucide-react"

import {
  overtimeApi,
  type OvertimeRequest,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

const STATUS_BADGES: Record<string, { label: string; className: string; icon: any }> = {
  PENDING_TECHNICIAN: { label: "Awaiting Technician", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Clock },
  PENDING_APPROVAL: { label: "Needs Approval", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: AlertTriangle },
  APPROVED: { label: "Active", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", className: "bg-red-500/15 text-red-600 dark:text-red-400", icon: XCircle },
  EXPIRED_NO_RESPONSE: { label: "Expired", className: "bg-muted text-muted-foreground", icon: Clock },
  EXPIRED_NO_APPROVAL: { label: "Expired", className: "bg-muted text-muted-foreground", icon: Clock },
  COMPLETED: { label: "Completed", className: "bg-muted text-foreground", icon: CheckCircle2 },
  CANCELED: { label: "Declined", className: "bg-muted text-muted-foreground", icon: XCircle },
}

const DURATION_OPTIONS = [
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "1.5 hours", value: 90 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
  { label: "4 hours", value: 240 },
]

export default function OvertimePage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState("pending")

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<OvertimeRequest | null>(null)
  const [approveDuration, setApproveDuration] = useState("120")
  const [approveNotes, setApproveNotes] = useState("")

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<OvertimeRequest | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  // History filters
  const [historyStatus, setHistoryStatus] = useState("all")
  const [historyPage, setHistoryPage] = useState(1)

  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ["overtime-pending"],
    queryFn: () => overtimeApi.getPendingApprovals(),
    refetchInterval: 30000,
  })

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["overtime-history", historyStatus, historyPage],
    queryFn: () => overtimeApi.getHistory({
      status: historyStatus === "all" ? undefined : historyStatus,
      page: historyPage,
      limit: 15,
    }),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { maxDurationMinutes: number; notes?: string } }) =>
      overtimeApi.approve(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overtime-pending"] })
      queryClient.invalidateQueries({ queryKey: ["overtime-history"] })
      setApproveTarget(null)
      toast.success("Overtime approved")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to approve"),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { reason: string } }) =>
      overtimeApi.reject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overtime-pending"] })
      queryClient.invalidateQueries({ queryKey: ["overtime-history"] })
      setRejectTarget(null)
      toast.success("Overtime rejected")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to reject"),
  })

  const pending = pendingData || []
  const history = historyData?.data || []
  const historyMeta = historyData?.meta

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">Overtime Management</h1>
              <p className="mt-1.5 text-muted-foreground">
                Review and manage technician overtime requests
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl border-border/80 shadow-sm"
              onClick={() => { refetchPending(); refetchHistory(); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="pending" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Pending
              {pending.length > 0 && (
                <Badge className="bg-blue-600 text-white text-xs ml-1">{pending.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Clock className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          {/* PENDING TAB */}
          <TabsContent value="pending">
            {pendingLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
              </div>
            ) : pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-emerald-50 p-4 mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">No pending requests</h3>
                <p className="text-sm text-muted-foreground mt-1">All overtime requests have been handled</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {pending.map((req) => (
                  <OvertimeCard
                    key={req.id}
                    request={req}
                    onApprove={() => { setApproveTarget(req); setApproveDuration("120"); setApproveNotes(""); }}
                    onReject={() => { setRejectTarget(req); setRejectReason(""); }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history">
            <div className="flex items-center justify-between mb-4">
              <Select value={historyStatus} onValueChange={(v) => { setHistoryStatus(v); setHistoryPage(1); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="CANCELED">Declined</SelectItem>
                  <SelectItem value="EXPIRED_NO_RESPONSE">Expired (No Response)</SelectItem>
                  <SelectItem value="EXPIRED_NO_APPROVAL">Expired (No Approval)</SelectItem>
                </SelectContent>
              </Select>
              {historyMeta && (
                <p className="text-sm text-muted-foreground">
                  {historyMeta.total} request{historyMeta.total !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {historyLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Clock className="h-8 w-8 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground">No overtime history</h3>
              </div>
            ) : (
              <div className="grid gap-3">
                {history.map((req: OvertimeRequest) => (
                  <HistoryCard key={req.id} request={req} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {historyMeta && historyMeta.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {historyPage} of {historyMeta.totalPages}</span>
                <Button variant="outline" size="sm" disabled={historyPage >= historyMeta.totalPages} onClick={() => setHistoryPage(historyPage + 1)}>
                  Next
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Approve Dialog */}
        <Dialog open={!!approveTarget} onOpenChange={(open) => { if (!open) setApproveTarget(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Approve Overtime</DialogTitle>
              <DialogDescription>
                Approve overtime for {approveTarget?.technician?.firstName} {approveTarget?.technician?.lastName} at {approveTarget?.location?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {approveTarget?.technicianReason && (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground mb-1">Technician's reason:</p>
                  <p className="text-sm text-foreground">{approveTarget.technicianReason}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Overtime Duration</Label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setApproveDuration(opt.value.toString())}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        approveDuration === opt.value.toString()
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-card text-foreground border-border hover:border-border"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Input
                  placeholder="Any notes for the technician..."
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => approveTarget && approveMutation.mutate({
                  id: approveTarget.id,
                  data: { maxDurationMinutes: parseInt(approveDuration), notes: approveNotes.trim() || undefined },
                })}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reject Overtime</DialogTitle>
              <DialogDescription>
                Reject overtime for {rejectTarget?.technician?.firstName} {rejectTarget?.technician?.lastName}. They will be clocked out.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Reason for rejection *</Label>
                <Input
                  placeholder="Why is this overtime not approved?"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => rejectTarget && rejectMutation.mutate({
                  id: rejectTarget.id,
                  data: { reason: rejectReason.trim() },
                })}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
              >
                {rejectMutation.isPending ? "Rejecting..." : "Reject & Clock Out"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

// ============================================================================
// PENDING OVERTIME CARD
// ============================================================================

function OvertimeCard({
  request,
  onApprove,
  onReject,
}: {
  request: OvertimeRequest
  onApprove: () => void
  onReject: () => void
}) {
  const badge = STATUS_BADGES[request.status] || STATUS_BADGES.PENDING_APPROVAL

  return (
    <div className="rounded-xl border border-blue-200 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Timer className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground">
                {request.technician?.firstName} {request.technician?.lastName}
              </h3>
              <Badge className={badge.className}>{badge.label}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {request.location?.name}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
              </span>
            </div>
            {request.technicianReason && (
              <p className="mt-2 text-sm text-muted-foreground bg-muted rounded-md px-3 py-1.5">
                "{request.technicianReason}"
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={onReject}>
            <XCircle className="h-4 w-4 mr-1" />
            Reject
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onApprove}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Approve
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// HISTORY CARD
// ============================================================================

function HistoryCard({ request }: { request: OvertimeRequest }) {
  const badge = STATUS_BADGES[request.status] || STATUS_BADGES.COMPLETED
  const Icon = badge.icon

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground text-sm">
                {request.technician?.firstName} {request.technician?.lastName}
              </span>
              <Badge variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{request.location?.name}</span>
              <span>{format(new Date(request.createdAt), "MMM d, h:mm a")}</span>
              {request.overtimeMinutes && (
                <span className="font-medium text-muted-foreground">{request.overtimeMinutes} min overtime</span>
              )}
              {request.approvalMethod && (
                <span className="inline-flex items-center gap-1">
                  {request.approvalMethod === "SIGNATURE" ? <Pen className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  {request.approvalMethod === "SIGNATURE" ? "Signed" : "Remote"}
                </span>
              )}
            </div>
          </div>
        </div>
        {request.approvedBy && (
          <span className="text-xs text-muted-foreground">
            by {request.approvedBy.firstName} {request.approvedBy.lastName}
          </span>
        )}
      </div>
    </div>
  )
}
