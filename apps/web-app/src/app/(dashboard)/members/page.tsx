"use client"

import { keys } from "@/lib/query-keys"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MemberBulkActionBar } from "./_components/member-bulk-action-bar"
import { MemberConfirmDialogs } from "./_components/member-confirm-dialogs"
import { useMembersPage } from "./_hooks/use-members-page";
import {
  CreateInvitationDialog,
  ManageRolesDialog,
  EditMemberDialog,
  AccessBuilder,
} from "./_components/members-page-helpers";
import { MembersPageTeam } from "./_components/members-page-team";

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MembersPage() {
  const vm = useMembersPage();
  const {
    billingLocked,
    billingLockReason,
    t,
    queryClient,
    router,
    user,
    isAdmin,
    search,
    setSearch,
    roleFilter,
    setRoleFilter,
    orgRoles,
    setPage,
    editTarget,
    setEditTarget,
    removeTarget,
    setRemoveTarget,
    transferTarget,
    setTransferTarget,
    bulkAccessIds,
    setBulkAccessIds,
    inviteOpen,
    setInviteOpen,
    rolesOpen,
    setRolesOpen,
    showPending,
    setShowPending,
    selectedIds,
    setSelectedIds,
    isLoading,
    isError,
    refetch,
    isFetching,
    locations,
    memberSpacesMap,
    pendingInvitations,
    members,
    meta,
    totalCount,
    transferMutation,
    removeMutation,
    revokeInviteMutation,
    handleSelectMember,
    handleSelectAll,
    handleBulkRoleChange,
    handleBulkSpaceAssign,
    handleBulkRemove,
    handleBulkAccess,
  } = vm;

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-background">
      <MembersPageTeam vm={vm} />

      {/* ── Edit Member Dialog (shared component) ───────────────────────── */}
      <EditMemberDialog
        member={editTarget}
        isSelf={!!editTarget && editTarget.id === user?.id}
        onClose={() => setEditTarget(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: keys.members.lists() })}
      />

      {/* ── Invite Dialog (shared component) ─────────────────────────── */}
      <CreateInvitationDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ManageRolesDialog open={rolesOpen} onOpenChange={setRolesOpen} />

      {/* ── Transfer Ownership / Remove Confirmations ─────────────────── */}
      <MemberConfirmDialogs
        transferTarget={transferTarget}
        setTransferTarget={setTransferTarget}
        onTransfer={(id) => transferMutation.mutate(id)}
        transferPending={transferMutation.isPending}
        removeTarget={removeTarget}
        setRemoveTarget={setRemoveTarget}
        onRemove={(id) => removeMutation.mutate(id)}
        removePending={removeMutation.isPending}
      />

      {/* ── Bulk Action Bar ───────────────────────────────────────────── */}
      {isAdmin && (
        <MemberBulkActionBar
          selectedIds={selectedIds}
          locations={locations}
          onClear={() => setSelectedIds(new Set())}
          onBulkRoleChange={handleBulkRoleChange}
          onBulkSpaceAssign={handleBulkSpaceAssign}
          onBulkAccess={handleBulkAccess}
          onBulkRemove={handleBulkRemove}
        />
      )}

      {/* ── Bulk Access Dialog — full Access Builder applied to all selected ── */}
      <Dialog open={!!bulkAccessIds} onOpenChange={(open) => !open && setBulkAccessIds(null)}>
        <DialogContent className="p-0 gap-0 max-h-[88vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("members.bulk.accessTitle", "Bulk access")}</DialogTitle>
            <DialogDescription>{t("members.bulk.accessDesc", "Apply access to the selected members")}</DialogDescription>
          </DialogHeader>
          {bulkAccessIds && bulkAccessIds.length > 0 && (() => {
            const template = members.find((m) => m.id === bulkAccessIds[0]) || members.find((m) => bulkAccessIds.includes(m.id))
            if (!template) return null
            return (
              <AccessBuilder
                member={template}
                applyToIds={bulkAccessIds}
                bulkCount={bulkAccessIds.length}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: keys.members.lists() })
                  setBulkAccessIds(null)
                  setSelectedIds(new Set())
                }}
              />
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
