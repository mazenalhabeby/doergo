"use client"

import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
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
import { cn } from "@/lib/utils"
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

const STATUS_OPTIONS_KEYS = [
  { value: "all", labelKey: "common.allStatuses" },
  { value: InvitationStatus.PENDING, labelKey: "invitations.status.pending" },
  { value: InvitationStatus.ACCEPTED, labelKey: "invitations.status.accepted" },
  { value: InvitationStatus.EXPIRED, labelKey: "invitations.status.expired" },
  { value: InvitationStatus.REVOKED, labelKey: "invitations.status.revoked" },
] as const

function getStatusBadge(status: InvitationStatus, t: (key: string) => string) {
  switch (status) {
    case InvitationStatus.PENDING:
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{t("invitations.status.pending")}</Badge>
    case InvitationStatus.ACCEPTED:
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{t("invitations.status.accepted")}</Badge>
    case InvitationStatus.EXPIRED:
      return <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100">{t("invitations.status.expired")}</Badge>
    case InvitationStatus.REVOKED:
      return <Badge className="bg-red-100 text-red-600 hover:bg-red-100">{t("invitations.status.revoked")}</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getRoleBadge(role: string, t: (key: string) => string) {
  switch (role) {
    case "TECHNICIAN":
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{t("members.roles.technician")}</Badge>
    case "DISPATCHER":
      return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">{t("members.roles.dispatcher")}</Badge>
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
  const { t } = useTranslation()
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
      toast.success(t("invitations.revokeDialog.revokedSuccessfully"))
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
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                {t("invitations.title")}
              </h1>
              <p className="mt-1.5 text-slate-500">
                {t("invitations.subtitle")}
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

              {/* Create */}
              <Button
                className="h-11 px-5 rounded-xl font-medium gap-2"
                onClick={() => setCreateDialogOpen(true)}
              >
                <UserPlus className="size-4" />
                {t("invitations.createInvitation")}
              </Button>
            </div>
          </div>
        </div>

        {/* Summary */}
        {total > 0 && (
          <div className="mb-4">
            <p className="text-sm text-slate-500">
              {t("invitations.showingRange", { start: startItem, end: endItem, total, plural: total !== 1 ? "s" : "" })}
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
              <h3 className="text-lg font-medium text-slate-800 mb-2">{t("invitations.failedToLoad")}</h3>
              <p className="text-sm text-slate-500 mb-4">{(error as Error)?.message}</p>
              <Button variant="outline" className="rounded-xl" onClick={() => refetch()}>
                {t("common.tryAgain")}
              </Button>
            </div>
          ) : invitations.length === 0 ? (
            <div className="p-16 text-center">
              <Mail className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-800 mb-2">{t("invitations.noInvitationsFound")}</h3>
              <p className="text-sm text-slate-400 mb-4">
                {statusFilter !== "all"
                  ? t("invitations.noInvitationsHint")
                  : t("invitations.createFirstInvitation")}
              </p>
              {statusFilter === "all" && (
                <Button className="rounded-xl" onClick={() => setCreateDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t("invitations.createInvitation")}
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="font-semibold text-slate-600">{t("invitations.table.role")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("invitations.table.code")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("invitations.table.status")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("invitations.table.createdBy")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("invitations.table.created")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("invitations.table.expires")}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t("invitations.table.usedBy")}</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div className="space-y-1">
                        {getRoleBadge(inv.targetRole, t)}
                          <div className="text-xs text-slate-500">
                            {inv.specialty && ` / ${inv.specialty}`}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {inv.code ? (
                        <span className="font-mono text-sm font-semibold tracking-wider text-slate-700 bg-slate-100 px-2 py-1 rounded">
                          {inv.code}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(inv.status, t)}</TableCell>
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
                              {t("invitations.revokeDialog.revokeButton")}
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

      {/* Create Invitation Dialog */}
      <CreateInvitationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invitations.revokeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invitations.revokeDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-red-600 hover:bg-red-700"
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? t("common.revoking") : t("invitations.revokeDialog.revokeButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
