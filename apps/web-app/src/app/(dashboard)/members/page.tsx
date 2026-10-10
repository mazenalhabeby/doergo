"use client"

import { keys, membersPageParams } from "@/lib/query-keys"
import { useState, useMemo, useEffect } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Search, UserPlus, Smartphone, Shield } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useBillingLock } from "@/hooks/use-billing-lock"

import { useAuth } from "@/contexts/auth-context"
// Lazy (audit M-C1). These four dialogs are ~1,455 lines that only render after a
// click, and they were being shipped in the first paint of a page whose job is a
// table. ssr:false because none of them renders on the server anyway.
const CreateInvitationDialog = dynamic(
  () => import("@/components/invitations/create-invitation-dialog").then((m) => m.CreateInvitationDialog),
  { ssr: false },
)
const ManageRolesDialog = dynamic(
  () => import("@/components/roles/manage-roles-dialog").then((m) => m.ManageRolesDialog),
  { ssr: false },
)
const EditMemberDialog = dynamic(
  () => import("./_components/edit-member-dialog").then((m) => m.EditMemberDialog),
  { ssr: false },
)
const AccessBuilder = dynamic(
  () => import("@/components/access-builder").then((m) => m.AccessBuilder),
  { ssr: false },
)
import {
  organizationsApi,
  type AccessRole,
  invitationsApi,
  locationsApi,
  type OrgMember,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PAGE_SHELL } from "@/components/ui/page-width";
import { MemberBulkActionBar } from "./_components/member-bulk-action-bar"
import { MembersTable } from "./_components/members-table"
import { PendingInvitations } from "./_components/pending-invitations"
import { MemberConfirmDialogs } from "./_components/member-confirm-dialogs"
import { useMemberActions } from "./_lib/use-member-actions"

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MembersPage() {
  // Adding a member is a write AND the thing that moves the bill — doubly
  // worth refusing before the dialog rather than at submit.
  const { locked: billingLocked, reason: billingLockReason } = useBillingLock()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const [search, setSearch] = useState("")
  // Debounced value drives the query so typing doesn't mint a request per keystroke (P7).
  const debouncedSearch = useDebouncedValue(search, 300)
  const [roleFilter, setRoleFilter] = useState("all")

  /*
    The org's own roles, for the filter beside the list.

    The Role column shows a member's ASSIGNED ROLE where they have one and falls
    back to the account type otherwise, but the filter offered only the two
    account types — hardcoded — so a role an organization created was visible in
    every row and selectable in none.

    Same query key as the Roles dialog, so opening that dialog after filtering
    costs nothing.
  */
  const { data: orgRoles = [] } = useQuery<AccessRole[]>({
    queryKey: keys.organization.roles(),
    queryFn: () => organizationsApi.getRoles("org"),
    staleTime: 5 * 60 * 1000,
  })
  const [page, setPage] = useState(1)

  // Dialogs
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null)
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null)
  const [transferTarget, setTransferTarget] = useState<OrgMember | null>(null)
  const [bulkAccessIds, setBulkAccessIds] = useState<string[] | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)

  // Pending invitations
  const [showPending, setShowPending] = useState(true)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Selection is per visible page — reset it when the page/search/filter changes
  // so a bulk action can never apply to members you can't see (D4).
  useEffect(() => {
    setSelectedIds(new Set())
  }, [debouncedSearch, roleFilter, page])

  // ── Queries ──────────────────────────────────────────────────────────

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: keys.members.list(membersPageParams(debouncedSearch, roleFilter, page)),
    queryFn: () => organizationsApi.getMembers(membersPageParams(debouncedSearch, roleFilter, page)),
  })

  const { data: locationsData } = useQuery({
    queryKey: keys.locations.list({ limit: 100 }),
    queryFn: () => locationsApi.list({ limit: 100 }),
    staleTime: 60000,
  })

  // Fetch all assignments to build member->spaces map
  const locations = locationsData?.data || []

  // Stable key = sorted location ids, so adding+removing a space (same count)
  // still busts the cache (was keyed on locations.length — fragile) (D3).
  const locationIds = useMemo(() => locations.map((l) => l.id).sort(), [locations])
  const locNameById = useMemo(
    () => Object.fromEntries(locations.map((l) => [l.id, l.name])) as Record<string, string>,
    [locations],
  )

  const { data: allAssignments } = useQuery({
    // ONE batched request for every space's roster (was an N+1 fan-out) (P2).
    queryKey: keys.locations.rosterBatch(locationIds),
    queryFn: () => locationsApi.getRosters(locationIds),
    enabled: locationIds.length > 0,
    staleTime: 60000,
  })

  // Build a map: userId -> space names
  const memberSpacesMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    if (!allAssignments) return map
    for (const a of allAssignments) {
      const userId = a.userId || a.user?.id
      if (!userId) continue
      const locationName = a.location?.name || locNameById[a.locationId]
      if (!map[userId]) map[userId] = []
      if (locationName && !map[userId]!.includes(locationName)) {
        map[userId]!.push(locationName)
      }
    }
    return map
  }, [allAssignments, locNameById])

  const { data: pendingInvitationsData } = useQuery({
    queryKey: keys.people.pendingInvitations(),
    queryFn: () => invitationsApi.list({ status: "PENDING", limit: 50 }),
    enabled: isAdmin,
  })

  const pendingInvitations = pendingInvitationsData?.data || []
  const members = data?.data || []
  const meta = data?.meta
  const totalCount = meta?.total ?? 0

  // ── Mutations & handlers ─────────────────────────────────────────────

  const {
    transferMutation, removeMutation, revokeInviteMutation,
    handleSelectMember, handleSelectAll, handleBulkRoleChange, handleBulkSpaceAssign, handleBulkRemove, handleBulkAccess,
  } = useMemberActions({
    t, queryClient, refreshUser, debouncedSearch, roleFilter, page, members, userId: user?.id,
    setTransferTarget, setRemoveTarget, setSelectedIds, setBulkAccessIds,
  })


  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-background">
      <div className={PAGE_SHELL}>
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {t("members.team")} {!isLoading && <span className="text-muted-foreground font-normal text-lg">({totalCount})</span>}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("members.teamSubtitle")}
              </p>
            </div>

            <div className="flex items-center gap-3">
            {/* Phone sync — only where phones keep work offline, and only for whoever manages people. */}
            {user?.canManageUsers && user?.offlineMode && (
              <Button asChild variant="outline" size="sm" className="h-9 rounded-lg">
                <Link href="/members/phone-sync">
                  <Smartphone className="h-4 w-4 mr-2" />
                  {t("members.phoneSync.entry")}
                </Link>
              </Button>
            )}
            {/* Search */}
            <div className="relative" data-tour="members-search">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("members.searchPlaceholder")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9 w-56 h-9 bg-card border-border/80 rounded-lg text-sm"
              />
            </div>

            {/* Role filter */}
            <Select
              value={roleFilter}
              onValueChange={(v) => {
                setRoleFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[130px] h-9 bg-card border-border/80 rounded-lg text-sm">
                <SelectValue placeholder={t("common.all")} />
              </SelectTrigger>
              <SelectContent>
                {/*
                  The roles this organization has, and the one state that is not
                  a role.

                  This listed the ACCOUNT TYPES as well — so "Admin" appeared
                  twice meaning two different things, and "Employee" and "No
                  role" were two labels for the same people. Both duplications
                  came from exposing an internal distinction (account type vs
                  assigned role) that nobody outside the code thinks in.

                  A member either holds one of these roles or holds none, and
                  the Role column already says exactly that. The filter now
                  offers what the column shows.
                */}
                <SelectItem value="all">{t("common.allRoles")}</SelectItem>
                {orgRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
                {/* No role assigned — which the list displays as Employee. */}
                <SelectItem value="none">{t("members.roles.employee")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Manage roles */}
            {isAdmin && (
              <Button
                onClick={() => setRolesOpen(true)}
                size="sm"
                variant="outline"
                className="h-9 px-4 rounded-lg font-medium"
              >
                <Shield className="h-4 w-4 mr-1.5" />
                {t("roles.manage", "Roles")}
              </Button>
            )}

            {/* Invite */}
            {isAdmin && (
              <Button
                disabled={billingLocked}
                title={billingLocked ? billingLockReason : undefined}
                onClick={() => setInviteOpen(true)}
                size="sm"
                data-tour="members-invite"
                className="h-9 px-4 rounded-lg font-medium"
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                {t("members.inviteShort")}
              </Button>
            )}
          </div>
          </div>
        </div>

        <MembersTable
          members={members}
          meta={meta}
          isLoading={isLoading}
          isError={isError}
          isFetching={isFetching}
          refetch={refetch}
          isAdmin={isAdmin}
          userId={user?.id}
          isOwner={!!user?.isOwner}
          selectedIds={selectedIds}
          memberSpacesMap={memberSpacesMap}
          onSelectMember={handleSelectMember}
          onSelectAll={handleSelectAll}
          onEdit={setEditTarget}
          onRemove={setRemoveTarget}
          onTransfer={setTransferTarget}
          onNavigate={(id) => router.push(`/members/${id}`)}
          setPage={setPage}
          billingLocked={billingLocked}
          billingLockReason={billingLockReason}
          onInvite={() => setInviteOpen(true)}
        />

        {/* ── Pending Invitations ────────────────────────────────────── */}
        {isAdmin && pendingInvitations.length > 0 && (
          <PendingInvitations
            pendingInvitations={pendingInvitations}
            showPending={showPending}
            onToggle={() => setShowPending((p) => !p)}
            onRevoke={(id) => revokeInviteMutation.mutate(id)}
            revoking={revokeInviteMutation.isPending}
          />
        )}

      </div>

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
