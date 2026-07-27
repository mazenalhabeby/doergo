"use client"

import { useState } from "react"
import { format } from "date-fns"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Loader2 } from "lucide-react"

import { attendanceApi, type TimeEntry } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// ISO string → value for a <input type="datetime-local"> (browser-local time,
// matching how the table renders times). Empty string when null.
function toLocalInput(iso?: string | null): string {
  if (!iso) return ""
  try {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
  } catch {
    return ""
  }
}

export function EditEntryDialog({ entry }: { entry: TimeEntry }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [clockIn, setClockIn] = useState(() => toLocalInput(entry.clockInAt))
  const [clockOut, setClockOut] = useState(() => toLocalInput(entry.clockOutAt))
  const [notes, setNotes] = useState(entry.notes ?? "")
  const [reason, setReason] = useState("")

  // Reset local state to the entry's current values whenever the dialog opens.
  function openWith(next: boolean) {
    if (next) {
      setClockIn(toLocalInput(entry.clockInAt))
      setClockOut(toLocalInput(entry.clockOutAt))
      setNotes(entry.notes ?? "")
      setReason("")
    }
    setOpen(next)
  }

  const mutation = useMutation({
    mutationFn: () =>
      attendanceApi.editEntry(entry.id, {
        clockInAt: clockIn ? new Date(clockIn).toISOString() : undefined,
        clockOutAt: clockOut ? new Date(clockOut).toISOString() : undefined,
        notes: notes.trim() || undefined,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
      notify.success(t("attendance.editEntry.success"))
      setOpen(false)
    },
    onError: (err: Error) => {
      notify.error(err.message || t("attendance.editEntry.error"))
    },
  })

  const clockOutBeforeIn = !!clockIn && !!clockOut && new Date(clockOut) <= new Date(clockIn)
  const canSubmit = !!reason.trim() && !!clockIn && !clockOutBeforeIn && !mutation.isPending

  return (
    <Dialog open={open} onOpenChange={openWith}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
          title={t("attendance.editEntry.button")}
          aria-label={t("attendance.editEntry.button")}
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("attendance.editEntry.title")}</DialogTitle>
          <DialogDescription>
            {t("attendance.editEntry.description", {
              name: `${entry.user?.firstName ?? ""} ${entry.user?.lastName ?? ""}`.trim(),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("attendance.clockIn")}</Label>
              <Input
                type="datetime-local"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.clockOut")}</Label>
              <Input
                type="datetime-local"
                value={clockOut}
                min={clockIn || undefined}
                onChange={(e) => setClockOut(e.target.value)}
              />
            </div>
          </div>
          {clockOutBeforeIn && (
            <p className="text-xs text-destructive">{t("attendance.editEntry.clockOutBeforeIn")}</p>
          )}

          <div className="space-y-1.5">
            <Label>{t("attendance.editEntry.notes")}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("attendance.editEntry.notesPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              {t("attendance.editEntry.reason")} <span className="text-destructive">*</span>
            </Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("attendance.editEntry.reasonPlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("attendance.editEntry.reasonHint")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("attendance.editEntry.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
