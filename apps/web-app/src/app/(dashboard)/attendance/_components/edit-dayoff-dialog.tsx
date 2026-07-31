"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Loader2, Trash2 } from "lucide-react"

import { employeesApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type DayOff = {
  id: string
  startDate: string
  endDate: string
  reason?: string | null
  technician?: { id: string; firstName: string; lastName: string } | null
}

// A date-only value ("2026-07-24T00:00:00.000Z") → "2026-07-24" for <input type="date">,
// without a timezone shift (slice, don't re-parse through local time).
function toDateInput(v?: string | null): string {
  return v ? v.slice(0, 10) : ""
}

export function EditDayOffDialog({ dayOff }: { dayOff: DayOff }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState(() => toDateInput(dayOff.startDate))
  const [endDate, setEndDate] = useState(() => toDateInput(dayOff.endDate))
  const [reason, setReason] = useState(dayOff.reason ?? "")
  const [confirmDelete, setConfirmDelete] = useState(false)

  function openWith(next: boolean) {
    if (next) {
      setStartDate(toDateInput(dayOff.startDate))
      setEndDate(toDateInput(dayOff.endDate))
      setReason(dayOff.reason ?? "")
      setConfirmDelete(false)
    }
    setOpen(next)
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["attendance"] })
    queryClient.invalidateQueries({ queryKey: ["orgTimeOff"] })
  }

  const save = useMutation({
    mutationFn: () =>
      employeesApi.updateTimeOff(dayOff.id, {
        startDate,
        endDate,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      invalidate()
      notify.success(t("attendance.editDayOff.success", "Day off updated"))
      setOpen(false)
    },
    onError: (err: Error) => notify.error(err.message || t("attendance.editDayOff.error", "Couldn’t update the day off")),
  })

  const remove = useMutation({
    mutationFn: () => employeesApi.adminDeleteTimeOff(dayOff.id),
    onSuccess: () => {
      invalidate()
      notify.success(t("attendance.editDayOff.deleteSuccess", "Day off removed"))
      setOpen(false)
    },
    onError: (err: Error) => notify.error(err.message || t("attendance.editDayOff.error", "Couldn’t update the day off")),
  })

  const endBeforeStart = !!startDate && !!endDate && endDate < startDate
  const busy = save.isPending || remove.isPending
  const canSubmit = !!startDate && !!endDate && !endBeforeStart && !busy

  return (
    <Dialog open={open} onOpenChange={openWith}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
          title={t("attendance.editDayOff.button", "Edit day off")}
          aria-label={t("attendance.editDayOff.button", "Edit day off")}
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("attendance.editDayOff.title", "Edit day off")}</DialogTitle>
          <DialogDescription>
            {t("attendance.editDayOff.description", "For {{name}}", {
              name: `${dayOff.technician?.firstName ?? ""} ${dayOff.technician?.lastName ?? ""}`.trim(),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("attendance.editDayOff.start", "First day")}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.editDayOff.end", "Last day")}</Label>
              <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {endBeforeStart && (
            <p className="text-xs text-destructive">
              {t("attendance.editDayOff.endBeforeStart", "The last day can’t be before the first day.")}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{t("attendance.editDayOff.reason", "Reason")}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("attendance.editDayOff.reasonPlaceholder", "Vacation, sick leave, personal…")}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
          >
            {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Trash2 className="mr-1.5 size-4" />
            {confirmDelete ? t("attendance.editDayOff.confirmDelete", "Confirm remove") : t("attendance.editDayOff.delete", "Remove")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={() => save.mutate()} disabled={!canSubmit}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("attendance.editDayOff.save", "Save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
