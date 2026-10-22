"use client"

import { personName } from "@hbcfield/shared/client"
import { UserPlus, Mail, Clock, MoreHorizontal, Trash2 } from "lucide-react"

import { InvitationStatus } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ListPageHeader, ListPager, ListTableError, ListTableLoading } from "@/components/common/list-page"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog"
import { formatMediumDateTime } from "@/lib/format-date"
import { useInvitationsPage } from "./_hooks/use-invitations-page"
import { STATUS_OPTIONS_KEYS, getStatusBadge, getRoleBadge, isExpired } from "./_components/invitation-badges"

export default function InvitationsPage() {
  const {
    t,
    statusFilter,
    page,
    setPage,
    createDialogOpen,
    setCreateDialogOpen,
    revokeDialogOpen,
    setRevokeDialogOpen,
    isLoading,
    isError,
    error,
    refetch,
    revokeMutation,
    handleStatusChange,
    handleRevokeClick,
    confirmRevoke,
    invitations,
    totalPages,
    total,
    startItem,
    endItem,
  } = useInvitationsPage()

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page Header */}
        <ListPageHeader
          tour="page-invitations"
          title={t("invitations.title")}
          subtitle={t("invitations.subtitle")}
          statusFilter={statusFilter}
          onStatusChange={handleStatusChange}
          statusOptions={STATUS_OPTIONS_KEYS}
          isLoading={isLoading}
          onRefresh={() => refetch()}
        >
          {/* Create */}
          <Button className="h-11 px-5 rounded-xl font-medium gap-2" onClick={() => setCreateDialogOpen(true)}>
            <UserPlus className="size-4" />
            {t("invitations.createInvitation")}
          </Button>
        </ListPageHeader>

        {/* Summary */}
        {total > 0 && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              {t("invitations.showingRange", { start: startItem, end: endItem, total, plural: total !== 1 ? "s" : "" })}
            </p>
          </div>
        )}

        {/* Table */}
        <div className="bg-card rounded-xl border border-border/80 shadow-sm overflow-hidden">
          {isLoading ? (
            <ListTableLoading />
          ) : isError ? (
            <ListTableError title={t("invitations.failedToLoad")} error={error} onRetry={() => refetch()} />
          ) : invitations.length === 0 ? (
            <div className="p-16 text-center">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">{t("invitations.noInvitationsFound")}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {statusFilter !== "all" ? t("invitations.noInvitationsHint") : t("invitations.createFirstInvitation")}
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
                  <TableRow className="bg-muted">
                    <TableHead className="font-semibold text-muted-foreground">{t("invitations.table.role")}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t("invitations.table.code")}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">
                      {t("invitations.table.status")}
                    </TableHead>
                    <TableHead className="font-semibold text-muted-foreground">
                      {t("invitations.table.createdBy")}
                    </TableHead>
                    <TableHead className="font-semibold text-muted-foreground">
                      {t("invitations.table.created")}
                    </TableHead>
                    <TableHead className="font-semibold text-muted-foreground">
                      {t("invitations.table.expires")}
                    </TableHead>
                    <TableHead className="font-semibold text-muted-foreground">
                      {t("invitations.table.usedBy")}
                    </TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div className="space-y-1">
                          {getRoleBadge(inv.targetRole, t)}
                          {inv.specialty && <div className="text-xs text-muted-foreground">{inv.specialty}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {inv.code ? (
                          <span className="font-mono text-sm font-semibold tracking-wider text-foreground bg-muted px-2 py-1 rounded">
                            {inv.code}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(inv.status, t)}</TableCell>
                      <TableCell>
                        {inv.createdBy ? (
                          <span className="text-foreground">{personName(inv.createdBy)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{formatMediumDateTime(inv.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span
                            className={`text-sm ${
                              inv.status === InvitationStatus.PENDING && isExpired(inv.expiresAt)
                                ? "text-red-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatMediumDateTime(inv.expiresAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {inv.acceptedBy ? (
                          <div>
                            <span className="text-foreground">{personName(inv.acceptedBy)}</span>
                            <div className="text-xs text-muted-foreground">{inv.acceptedBy.email}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
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
                              <DropdownMenuItem className="text-red-600" onClick={() => handleRevokeClick(inv)}>
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
              <ListPager page={page} totalPages={totalPages} setPage={setPage} />
            </>
          )}
        </div>
      </div>

      {/* Create Invitation Dialog */}
      <CreateInvitationDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        title={t("invitations.revokeDialog.title")}
        description={t("invitations.revokeDialog.description")}
        confirmLabel={revokeMutation.isPending ? t("common.revoking") : t("invitations.revokeDialog.revokeButton")}
        onConfirm={confirmRevoke}
        destructive
        confirmDisabled={revokeMutation.isPending}
      />
    </div>
  )
}
