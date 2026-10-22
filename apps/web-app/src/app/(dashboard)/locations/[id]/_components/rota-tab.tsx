"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, CalendarDays, CalendarClock } from "lucide-react"
import type { ShiftAssignment } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { rotaApi, spaceMembersApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmTargetDialog } from "@/components/common/confirm-dialog"
import { SectionHeader, EmptyState } from "../../../../../components/common/section-header"
import { RotaDialog } from "./rota-dialog"
import { RotaWeekGrid } from "./rota-week-grid"
import { RotaAssignmentList } from "./rota-assignment-list"

/** A workspace's rota: who works which shift on which days, as a week grid and as a list. */
export function RotaTab({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ShiftAssignment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ShiftAssignment | null>(null)

  const { data: assignments, isLoading } = useQuery({
    queryKey: keys.schedules.rota(spaceId),
    queryFn: () => rotaApi.list(spaceId),
    staleTime: 30_000,
  })
  // Space members — to surface who works "open hours" (no shift assigned).
  const { data: spaceMembers } = useQuery({
    queryKey: keys.spaceMembers.list(spaceId),
    queryFn: () => spaceMembersApi.list(spaceId),
    staleTime: 30_000,
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => rotaApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.schedules.rota(spaceId) })
      setDeleteTarget(null)
      notify.success(t("scheduling.rota.toast.deleted"))
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.rota.toast.deleteFailed")),
  })

  const openEdit = (a: ShiftAssignment | null) => {
    setEditTarget(a)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={CalendarDays}
        accent="sky"
        title={t("scheduling.rota.heading")}
        description={t("scheduling.rota.intro")}
        action={
          <Button onClick={() => openEdit(null)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("scheduling.rota.new")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !assignments || assignments.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t("scheduling.rota.empty.title")}
          description={t("scheduling.rota.empty.description")}
          action={
            <Button onClick={() => openEdit(null)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("scheduling.rota.new")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <RotaWeekGrid assignments={assignments} spaceMembers={spaceMembers} onEdit={openEdit} />
          <RotaAssignmentList assignments={assignments} onEdit={openEdit} onDelete={setDeleteTarget} />
        </div>
      )}

      {dialogOpen && (
        <RotaDialog spaceId={spaceId} assignment={editTarget} open={dialogOpen} onOpenChange={setDialogOpen} />
      )}

      <ConfirmTargetDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("scheduling.rota.deleteTitle")}
        description={t("scheduling.rota.deleteConfirm")}
        confirmLabel={t("common.delete")}
        mutation={removeMutation}
      />
    </div>
  )
}
