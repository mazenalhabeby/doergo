"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  UserPlus,
  AlertCircle,
  Mail,
  Clock,
  Copy,
  Check,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import {
  invitationsApi,
  InvitationStatus,
  type Invitation,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog"

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: InvitationStatus.PENDING, label: "Pending" },
  { value: InvitationStatus.ACCEPTED, label: "Accepted" },
  { value: InvitationStatus.EXPIRED, label: "Expired" },
  { value: InvitationStatus.REVOKED, label: "Revoked" },
] as const

function getStatusBadge(status: InvitationStatus) {
  switch (status) {
    case InvitationStatus.PENDING:
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>
    case InvitationStatus.ACCEPTED:
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Accepted</Badge>
    case InvitationStatus.EXPIRED:
      return <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100">Expired</Badge>
    case InvitationStatus.REVOKED:
      return <Badge className="bg-red-100 text-red-600 hover:bg-red-100">Revoked</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getRoleBadge(role: string) {
  switch (role) {
    case "TECHNICIAN":
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Technician</Badge>
    case "DISPATCHER":
      return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Dispatcher</Badge>
    default:
      return <Badge variant="outline">{role}</Badge>
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

function isExpired(dateStr: string) {
  return new Date(dateStr) < new Date()
}

export default function InvitationsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Filter & pagination
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const limit = 10

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null)

  // Build query params
  const queryParams = useMemo(() => ({
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    limit,
  }), [statusFilter, page, limit])

  // Fetch invitations
  const { data: invitationsData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["invitations", queryParams],
    queryFn: () => invitationsApi.list(queryParams),
  })

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: (id: string) => invitationsApi.revoke(id),
    onSuccess: () => {
      toast.success("Invitation revoked")
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
      setRevokeDialogOpen(false)
      setSelectedInvitation(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke invitation")
    },
  })

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }

  const handleRevokeClick = (invitation: Invitation) => {
    setSelectedInvitation(invitation)
    setRevokeDialogOpen(true)
  }

  const confirmRevoke = () => {
    if (selectedInvitation) {
      revokeMutation.mutate(selectedInvitation.id)
    }
  }

  // Derived data
  const invitations = invitationsData?.data || []
  const meta = invitationsData?.meta
  const totalPages = meta?.totalPages || 1
  const total = meta?.total || 0

  const startItem = total > 0 ? (page - 1) * limit + 1 : 0
  const endItem = Math.min(page * limit, total)

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Invitations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Create and manage invitation codes for new team members
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Create Invitation
        </Button>
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
            <h3 className="text-lg font-medium text-slate-800 mb-2">Failed to load invitations</h3>
            <p className="text-sm text-slate-500 mb-4">{(error as Error)?.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : invitations.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">No invitations found</h3>
            <p className="text-sm text-slate-500 mb-4">
              {statusFilter !== "all"
                ? "Try adjusting your filter"
                : "Create your first invitation to add team members"}
            </p>
            {statusFilter === "all" && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Create Invitation
              </Button>
            )}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Used By</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div className="space-y-1">
                        {getRoleBadge(inv.targetRole)}
                        {inv.technicianType && (
                          <div className="text-xs text-slate-500">
                            {inv.technicianType === "FULL_TIME" ? "Full-Time" : "Freelancer"}
                            {inv.specialty && ` / ${inv.specialty}`}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(inv.status)}</TableCell>
                    <TableCell>
                      {inv.createdBy ? (
                        <span className="text-slate-700">
                          {inv.createdBy.firstName} {inv.createdBy.lastName}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">
                        {formatDate(inv.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span className={`text-sm ${
                          inv.status === InvitationStatus.PENDING && isExpired(inv.expiresAt)
                            ? "text-red-600"
                            : "text-slate-600"
                        }`}>
                          {formatDate(inv.expiresAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {inv.acceptedBy ? (
                        <div>
                          <span className="text-slate-700">
                            {inv.acceptedBy.firstName} {inv.acceptedBy.lastName}
                          </span>
                          <div className="text-xs text-slate-500">{inv.acceptedBy.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {inv.status === InvitationStatus.PENDING && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleRevokeClick(inv)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Revoke
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
                  Showing {startItem} to {endItem} of {total} invitations
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

      {/* Create Invitation Dialog */}
      <CreateInvitationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke this invitation? The code will no longer
              be valid for registration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-red-600 hover:bg-red-700"
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
