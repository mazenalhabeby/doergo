"use client"

import { Plus, CalendarDays } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmTargetDialog } from "@/components/common/confirm-dialog"
import { SectionHeader } from "./section-header"
import { useRotaTab } from "./use-rota-tab"
import { RotaDialog } from "./rota-tab-helpers"
import { RotaTabRota } from "./rota-tab-rota"

export function RotaTab({ spaceId }: { spaceId: string }) {
  const vm = useRotaTab({ spaceId })
  const {
    t,
    dialogOpen,
    setDialogOpen,
    editTarget,
    setEditTarget,
    deleteTarget,
    setDeleteTarget,
    assignments,
    isLoading,
    setWeekStart,
    days,
    dayStrs,
    todayStr,
    scheduledMembers,
    openMembers,
    cellFor,
    weekConflicts,
    removeMutation,
    recurrenceSummary,
  } = vm

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={CalendarDays}
        accent="sky"
        title={t("scheduling.rota.heading")}
        description={t("scheduling.rota.intro")}
        action={
          <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("scheduling.rota.new")}
          </Button>
        }
      />

      <RotaTabRota vm={vm} />

      {dialogOpen && (
        <RotaDialog
          spaceId={spaceId}
          assignment={editTarget}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
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
