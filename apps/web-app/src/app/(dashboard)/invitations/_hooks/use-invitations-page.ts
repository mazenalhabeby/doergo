"use client"

import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { invitationsApi, InvitationStatus, type Invitation } from "@/lib/api"
import { pageRange } from "@/components/common/list-page"
import { keys } from "@/lib/query-keys"

/** InvitationsPage's state and handlers — everything before its markup, moved here unchanged. */
export function useInvitationsPage() {
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
    queryKey: keys.people.invitations(queryParams),
    queryFn: () => invitationsApi.list(queryParams),
  })

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: (id: string) => invitationsApi.revoke(id),
    onSuccess: (_data, id) => {
      notify.success(t("invitations.revokeDialog.revokedSuccessfully"))
      // Remove the row from every cached invitations list immediately, then
      // reconcile in the background — no refresh needed.
      queryClient.setQueriesData<{ data?: Invitation[] } | undefined>({ queryKey: keys.people.invitations() }, (old) =>
        old?.data ? { ...old, data: old.data.filter((inv) => inv.id !== id) } : old,
      )
      queryClient.invalidateQueries({ queryKey: keys.people.invitations() })
      setRevokeDialogOpen(false)
      setSelectedInvitation(null)
    },
    onError: (error: Error) => {
      notify.error(error.message || "Failed to revoke invitation")
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

  // Derived data — revoked invites are archived: only shown when explicitly
  // filtering for "Revoked", so revoking removes the row from the default view.
  const invitations = (invitationsData?.data || []).filter(
    (inv: Invitation) => statusFilter === InvitationStatus.REVOKED || inv.status !== InvitationStatus.REVOKED,
  )
  const meta = invitationsData?.meta
  const totalPages = meta?.totalPages || 1
  const total = meta?.total || 0

  const { startItem, endItem } = pageRange(page, limit, total)

  return {
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
  }
}
