"use client"

import { cn } from "@/lib/utils"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { PageHeader, Panel } from "@/components/page/page-kit"
import { ListPager, ListTableError, ListTableLoading } from "@/components/common/list-page"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog"
import { useInvitationsPage } from "./_hooks/use-invitations-page"
import { STATUS_DOT, STATUS_OPTIONS_KEYS } from "./_components/invitation-badges"
import { InvitationCard } from "./_components/invitation-card"
import { FilterPill, FilterPills } from "@/components/page/page-controls"

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
      <div className={PAGE_SHELL}>
        <PageHeader
          tour="page-invitations"
          title={t("invitations.title")}
          subtitle={t("invitations.subtitle")}
          actions={
            <>
              <Button
                variant="outline"
                size="pillIcon"
                onClick={() => refetch()}
                disabled={isLoading}
                aria-label={t("common.refresh")}
              >
                <Icon name="refreshLine" className={cn(isLoading && "animate-spin")} />
              </Button>
              <Button size="pillLg" onClick={() => setCreateDialogOpen(true)}>
                <Icon name="addUser" />
                {t("invitations.createInvitation")}
              </Button>
            </>
          }
        />

        {/* Status — the board's filter pills (the same values the select carried). */}
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
          <FilterPills label={t("common.filterByStatus")}>
            {STATUS_OPTIONS_KEYS.map((option) => (
              <FilterPill
                key={option.value}
                active={statusFilter === option.value}
                onClick={() => handleStatusChange(option.value)}
                dot={option.value !== "all" ? STATUS_DOT[option.value] : undefined}
              >
                {t(option.labelKey)}
              </FilterPill>
            ))}
          </FilterPills>
          {total > 0 && (
            <span className="ml-auto text-[12.5px] text-muted-foreground">
              {t("invitations.showingRange", { start: startItem, end: endItem, total, plural: total !== 1 ? "s" : "" })}
            </span>
          )}
        </div>

        {isLoading ? (
          <Panel>
            <ListTableLoading />
          </Panel>
        ) : isError ? (
          <Panel>
            <ListTableError title={t("invitations.failedToLoad")} error={error} onRetry={() => refetch()} />
          </Panel>
        ) : invitations.length === 0 ? (
          <Panel className="px-6 py-14 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-shell-chip text-muted-foreground">
              <Icon name="invite" size={26} />
            </div>
            <h3 className="mb-1.5 text-[17px] font-semibold text-foreground">{t("invitations.noInvitationsFound")}</h3>
            <p className="mb-5 text-sm text-muted-foreground">
              {statusFilter !== "all" ? t("invitations.noInvitationsHint") : t("invitations.createFirstInvitation")}
            </p>
            {statusFilter === "all" && (
              <Button size="pillLg" onClick={() => setCreateDialogOpen(true)}>
                <Icon name="addUser" />
                {t("invitations.createInvitation")}
              </Button>
            )}
          </Panel>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
              {invitations.map((inv) => (
                <InvitationCard key={inv.id} inv={inv} onRevoke={handleRevokeClick} />
              ))}
            </div>
            <ListPager page={page} totalPages={totalPages} setPage={setPage} />
          </>
        )}
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
