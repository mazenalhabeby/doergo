"use client"

import { useCallback, type Dispatch, type SetStateAction } from "react"
import { useMutation, type QueryClient, type QueryKey } from "@tanstack/react-query"
import type { TFunction } from "i18next"

import { keys, membersPageParams } from "@/lib/query-keys"
import { organizationsApi, invitationsApi, locationsApi, type OrgMember } from "@/lib/api"
import { runBulk } from "@/lib/concurrency"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"

/**
 * Everything the members page DOES: remove (optimistically), revoke an
 * invitation, hand the organization over, and the bulk actions on a selection.
 */
/** A cached member or invitation list page: rows with ids, and the header's total. */
type MemberListCache = { data?: Array<{ id: string }>; meta?: { total?: number } & Record<string, unknown> } & Record<
  string,
  unknown
>

export function useMemberActions({
  t,
  queryClient,
  refreshUser,
  debouncedSearch,
  roleFilter,
  page,
  members,
  userId,
  setTransferTarget,
  setRemoveTarget,
  setSelectedIds,
  setBulkAccessIds,
}: {
  t: TFunction
  queryClient: QueryClient
  refreshUser: () => Promise<unknown>
  debouncedSearch: string
  roleFilter: string
  page: number
  members: OrgMember[]
  userId: string | undefined
  setTransferTarget: Dispatch<SetStateAction<OrgMember | null>>
  setRemoveTarget: Dispatch<SetStateAction<OrgMember | null>>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  setBulkAccessIds: Dispatch<SetStateAction<string[] | null>>
}) {
  // ── Mutations ────────────────────────────────────────────────────────

  // Optimistic removal (audit M-D4). Removing a member is a definite, reversible-on-
  // error action, so the row leaves immediately instead of sitting unchanged for a
  // full round-trip. onError restores the exact snapshot; onSettled re-reads so the
  // server, not the optimistic guess, has the last word.
  const dropRowOptimistically = useCallback(
    async (listKey: QueryKey, id: string) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const snapshot = queryClient.getQueriesData({ queryKey: listKey })
      queryClient.setQueriesData<MemberListCache>({ queryKey: listKey }, (old) => {
        if (!old?.data) return old
        const data = old.data.filter((row) => row.id !== id)
        // Keep the header count honest while the request is in flight.
        const meta = old.meta ? { ...old.meta, total: Math.max(0, (old.meta.total ?? 0) - 1) } : old.meta
        return { ...old, data, meta }
      })
      return snapshot
    },
    [queryClient],
  )

  const restoreSnapshot = useCallback(
    (snapshot?: [readonly unknown[], unknown][]) => {
      snapshot?.forEach(([key, value]) => queryClient.setQueryData(key, value))
    },
    [queryClient],
  )

  /**
   * Handing the organization to somebody else.
   *
   * No optimistic update: this changes who the VIEWER is as much as who the
   * target is — they stop being the owner — so the session and the list are both
   * refetched from the server rather than guessed at locally.
   */
  const transferMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.transferOwnership(memberId),
    onSuccess: async () => {
      setTransferTarget(null)
      notify.success(t("members.owner.transferred", "Ownership transferred"))
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: keys.members.lists() })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(memberId),
    onMutate: (memberId: string) => {
      setRemoveTarget(null) // close the dialog now — the action is committed
      // The page's own list. This named `["orgMembers"]` until the members
      // family moved to the endpoint table, after which the row never left early.
      return dropRowOptimistically(keys.members.list(membersPageParams(debouncedSearch, roleFilter, page)), memberId)
    },
    onSuccess: () => {
      notify.success(t("members.toast.memberRemoved"))
    },
    onError: (error: Error, _memberId, snapshot) => {
      restoreSnapshot(snapshot)
      notify.error(error.message || t("members.toast.removeFailed"))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.members.lists() })
      queryClient.invalidateQueries({ queryKey: keys.people.contacts() })
    },
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => invitationsApi.revoke(id),
    onMutate: (id: string) => dropRowOptimistically(keys.people.pendingInvitations(), id),
    onSuccess: () => {
      notify.success(t("invitations.revokeDialog.revokedSuccessfully"))
    },
    onError: (error: Error, _id, snapshot) => {
      restoreSnapshot(snapshot)
      notify.error(error.message || t("members.toast.revokeFailed"))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.people.pendingInvitations() })
    },
  })

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleSelectMember = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const selectableIds = members.filter((m) => m.id !== userId).map((m) => m.id)
        setSelectedIds(new Set(selectableIds))
      } else {
        setSelectedIds(new Set())
      }
    },
    [members, userId],
  )

  const handleBulkRoleChange = useCallback(
    async (memberIds: string[], role: string) => {
      try {
        // allSettled so one failure doesn't abort the rest, silently leaving the org
        // half-changed with the selection intact (D4). Always invalidate + clear.
        const results = await Promise.allSettled(memberIds.map((id) => organizationsApi.updateMember(id, { role })))
        const ok = results.filter((r) => r.status === "fulfilled").length
        const failed = results.length - ok
        queryClient.invalidateQueries({ queryKey: keys.members.lists() })
        setSelectedIds(new Set())
        if (failed === 0) notify.bulk(ok, t("members.toast.roleUpdated"))
        else notify.error(t("members.toast.bulkPartial", { ok, failed }))
      } catch (error) {
        notify.error(errorMessage(error, t("members.toast.updateRolesFailed")))
      }
    },
    [queryClient],
  )

  const handleBulkSpaceAssign = useCallback(
    async (memberIds: string[], locationId: string) => {
      try {
        const results = await Promise.allSettled(
          memberIds.map((id) => locationsApi.assignMember(locationId, { userId: id })),
        )
        const ok = results.filter((r) => r.status === "fulfilled").length
        const failed = results.length - ok
        queryClient.invalidateQueries({ queryKey: keys.locations.rosterBatches() })
        setSelectedIds(new Set())
        if (failed === 0) notify.success(t("members.toast.assignedToSpace", { count: ok }))
        else notify.error(t("members.toast.bulkPartial", { ok, failed }))
      } catch (error) {
        notify.error(errorMessage(error, t("members.toast.assignFailed")))
      }
    },
    [queryClient],
  )

  const handleBulkRemove = useCallback(
    async (memberIds: string[]) => {
      try {
        // Bounded (lib/concurrency) so a large removal is not refused by the rate limiter.
        const { failed, total } = await runBulk(memberIds, (id) => organizationsApi.removeMember(id))
        const ok = total - failed
        queryClient.invalidateQueries({ queryKey: keys.members.lists() })
        setSelectedIds(new Set())
        if (failed === 0) notify.success(t("members.toast.removedCount", { count: ok }))
        else notify.error(t("members.toast.bulkPartial", { ok, failed }))
      } catch (error) {
        notify.error(errorMessage(error, t("members.toast.removeMembersFailed")))
      }
    },
    [queryClient],
  )

  const handleBulkAccess = useCallback((memberIds: string[]) => {
    setBulkAccessIds(memberIds)
  }, [])

  return {
    transferMutation,
    removeMutation,
    revokeInviteMutation,
    handleSelectMember,
    handleSelectAll,
    handleBulkRoleChange,
    handleBulkSpaceAssign,
    handleBulkRemove,
    handleBulkAccess,
  }
}
