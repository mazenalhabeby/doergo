"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Loader2, Trash2 } from "lucide-react"

import { attendanceApi, type TimeEntry } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn, utcToZonedInput, zonedInputToUtc } from "@/lib/utils"

// Smart quick-pick reasons for editing an entry — click to fill the field
// (click again to clear); the admin can still type a custom reason. i18n keys
// fall back to English until translated.
const REASON_PRESETS: { key: string; fallback: string }[] = [
  { key: "attendance.editEntry.reasonPresets.forgotOut", fallback: "Forgot to clock out" },
  { key: "attendance.editEntry.reasonPresets.forgotIn", fallback: "Forgot to clock in" },
  { key: "attendance.editEntry.reasonPresets.wrongTime", fallback: "Wrong time entered" },
  { key: "attendance.editEntry.reasonPresets.wrongTz", fallback: "Wrong time zone" },
  { key: "attendance.editEntry.reasonPresets.lateTraffic", fallback: "Late — traffic" },
  { key: "attendance.editEntry.reasonPresets.managerApproved", fallback: "Approved by manager" },
  { key: "attendance.editEntry.reasonPresets.deviceIssue", fallback: "Device / GPS issue" },
]
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TimezoneCombobox } from "@/components/timezone-combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function EditEntryDialog({ entry }: { entry: TimeEntry }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // The zone the entry's times are shown in — same as the table (per-entry GPS
  // zone, then the space zone). Falls back to the org zone, then the browser's.
  const initialTz =
    entry.timezone ||
    entry.location?.timezone ||
    user?.organizationTimezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone

  const [open, setOpen] = useState(false)
  const [tz, setTz] = useState(initialTz)
  // Inputs hold wall-clock strings AS SEEN in `tz` (not browser-local).
  const [clockIn, setClockIn] = useState(() => utcToZonedInput(entry.clockInAt, initialTz))
  const [clockOut, setClockOut] = useState(() => utcToZonedInput(entry.clockOutAt, initialTz))
  const [notes, setNotes] = useState(entry.notes ?? "")
  const [reason, setReason] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Changing the zone keeps the real instant fixed and re-renders the wall clock
  // (e.g. 23:44 Berlin → 17:44 New York). So correcting a mis-zoned old row just
  // relabels it; the admin only retypes digits if the time itself was wrong.
  function changeTz(nextTz: string) {
    setClockIn((cur) => (cur ? utcToZonedInput(zonedInputToUtc(cur, tz), nextTz) : cur))
    setClockOut((cur) => (cur ? utcToZonedInput(zonedInputToUtc(cur, tz), nextTz) : cur))
    setTz(nextTz)
  }

  // Reset local state to the entry's current values whenever the dialog opens.
  function openWith(next: boolean) {
    if (next) {
      setTz(initialTz)
      setClockIn(utcToZonedInput(entry.clockInAt, initialTz))
      setClockOut(utcToZonedInput(entry.clockOutAt, initialTz))
      setNotes(entry.notes ?? "")
      setReason("")
      setConfirmDelete(false)
    }
    setOpen(next)
  }

  const mutation = useMutation({
    mutationFn: () =>
      attendanceApi.editEntry(entry.id, {
        clockInAt: clockIn ? zonedInputToUtc(clockIn, tz) : undefined,
        clockOutAt: clockOut ? zonedInputToUtc(clockOut, tz) : undefined,
        notes: notes.trim() || undefined,
        timezone: tz || undefined,
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

  const remove = useMutation({
    mutationFn: () => attendanceApi.deleteEntry(entry.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
      notify.success(t("attendance.editEntry.deleteSuccess", "Entry removed"))
      setOpen(false)
    },
    onError: (err: Error) => notify.error(err.message || t("attendance.editEntry.error")),
  })

  const clockOutBeforeIn =
    !!clockIn && !!clockOut && zonedInputToUtc(clockOut, tz) <= zonedInputToUtc(clockIn, tz)
  const busy = mutation.isPending || remove.isPending
  const canSubmit = !!reason.trim() && !!clockIn && !clockOutBeforeIn && !busy

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
      <DialogContent>
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
            <Label>{t("attendance.editEntry.timezone", "Time zone")}</Label>
            <TimezoneCombobox value={tz} onChange={changeTz} />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "attendance.editEntry.timezoneHint",
                "Times above are shown in this zone. Change it to correct a mis-zoned entry — the clock reading is kept.",
              )}
            </p>
          </div>

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
            <div className="flex flex-wrap gap-1.5">
              {REASON_PRESETS.map((p) => {
                const text = t(p.key, p.fallback)
                const active = reason.trim() === text
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setReason(active ? "" : text)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {text}
                  </button>
                )
              })}
            </div>
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

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
          >
            {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Trash2 className="mr-1.5 size-4" />
            {confirmDelete
              ? t("attendance.editEntry.confirmDelete", "Confirm remove")
              : t("attendance.editEntry.delete", "Remove")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("attendance.editEntry.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
