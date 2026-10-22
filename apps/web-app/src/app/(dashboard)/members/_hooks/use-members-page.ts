"use client";

import { keys, membersPageParams } from "@/lib/query-keys";
import { useSpaceDirectory } from "@/hooks/use-space-directory";
import { useState, useMemo, useEffect } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useBillingLock } from "@/hooks/use-billing-lock";
import { useAuth } from "@/contexts/auth-context";
import { organizationsApi, type AccessRole, invitationsApi, locationsApi, type OrgMember } from "@/lib/api";
import { useMemberActions } from "../_lib/use-member-actions";

/** MembersPage's state and handlers — everything before its markup, moved here unchanged. */
export function useMembersPage() {
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

  // The shared workspace directory (lib/space-directory) — the shell already
  // holds it, so this costs no request; the active ones, as `GET /locations` answered.
  const { data: directory } = useSpaceDirectory()
  const locations = useMemo(() => (directory ?? []).filter((l) => l.isActive !== false), [directory])

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

  return {
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
  };
}

/** What MembersPage and its sections read. */
export type MembersPageState = ReturnType<typeof useMembersPage>;
