"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Clock, Pencil, Trash2, Moon, CalendarRange, Coffee } from "lucide-react"

import { notify } from "@/lib/toast"
import { shiftsApi } from "@/lib/api"
import { shiftCrossesMidnight, type Shift } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmTargetDialog } from "@/components/common/confirm-dialog"
import { SectionHeader, EmptyState } from "../../../../../components/common/section-header"
import { keys } from "@/lib/query-keys"
import { DEFAULT_COLOR, ShiftDialog } from "./shift-dialog"

export function ShiftsTab({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Shift | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null)
  const queryClient = useQueryClient()

  // Includes this space's shifts + org-wide (spaceId null) reusable shifts.
  const { data: shifts, isLoading } = useQuery({
    queryKey: keys.schedules.shifts(spaceId),
    queryFn: () => shiftsApi.list(spaceId),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => shiftsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.schedules.shifts(spaceId) })
      setDeleteTarget(null)
      notify.success(t("scheduling.shifts.toast.deleted"))
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.shifts.toast.deleteFailed")),
  })

  const openCreate = () => {
    setEditTarget(null)
    setDialogOpen(true)
  }
  const openEdit = (shift: Shift) => {
    setEditTarget(shift)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={CalendarRange}
        accent="amber"
        title={t("scheduling.shifts.heading")}
        description={t("scheduling.shifts.intro")}
        action={
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("scheduling.shifts.new")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !shifts || shifts.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t("scheduling.shifts.empty.title")}
          description={t("scheduling.shifts.empty.description")}
          action={
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("scheduling.shifts.new")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {shifts.map((shift) => {
            const crosses = shiftCrossesMidnight(shift.startLocal, shift.endLocal)
            return (
              <div
                key={shift.id}
                className="flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: `${shift.color || DEFAULT_COLOR}20` }}
                  >
                    <Clock className="h-4 w-4" style={{ color: shift.color || DEFAULT_COLOR }} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">{shift.name}</span>
                      {!shift.spaceId && (
                        <Badge
                          variant="outline"
                          className={"text-[11px] border-border bg-muted text-muted-foreground " + ""}
                        >
                          {t("scheduling.shifts.orgWide")}
                        </Badge>
                      )}
                      {crosses && (
                        <Badge
                          variant="outline"
                          className={
                            "text-[11px] gap-1 border-amber-200 bg-amber-50 text-amber-700 " +
                            "dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }
                        >
                          <Moon className="h-3 w-3" />
                          {t("scheduling.shifts.crossesMidnight")}
                        </Badge>
                      )}
                      {!shift.isActive && (
                        <Badge variant="secondary" className="text-[11px] text-muted-foreground">
                          {t("common.inactive")}
                        </Badge>
                      )}
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <span>
                        {shift.startLocal} – {shift.endLocal}
                      </span>
                      {shift.breakMinutes > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span aria-hidden>·</span>
                          <Coffee className="h-3 w-3" />
                          {t("scheduling.shifts.breakSummary", { count: shift.breakMinutes })}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(shift)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    onClick={() => setDeleteTarget(shift)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dialogOpen && (
        <ShiftDialog spaceId={spaceId} shift={editTarget} open={dialogOpen} onOpenChange={setDialogOpen} />
      )}

      <ConfirmTargetDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("scheduling.shifts.deleteTitle")}
        description={t("scheduling.shifts.deleteConfirm", { name: deleteTarget?.name })}
        confirmLabel={t("common.delete")}
        mutation={removeMutation}
      />
    </div>
  )
}
