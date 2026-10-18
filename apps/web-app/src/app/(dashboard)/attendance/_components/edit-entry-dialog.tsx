"use client"

import { personName } from "@hbcfield/shared/client"
import { Pencil, Loader2, Trash2 } from "lucide-react"

import { type TimeEntry } from "@/lib/api"
import { cn } from "@/lib/utils"
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
import { useEditEntryDialog } from "./use-edit-entry-dialog"
import { REASON_PRESETS } from "./edit-entry-dialog-helpers"
import { EditEntryDialogAddBreak } from "./edit-entry-dialog-add-break"

/*
  Correcting and deleting are two permissions, asked by two routes:
  `PUT /attendance/entries/:id/edit` (canReconcileAttendance) and
  `DELETE /attendance/entries/:id` (canDeleteAttendance). A correction leaves the
  record and its history; a delete leaves neither, so correcting never implies it.

  Somebody holding only the delete switch still opens the dialog — the entry is
  shown read-only, with Remove and nothing else.
*/
export function EditEntryDialog({
  entry,
  canEdit = true,
  canDelete = false,
}: {
  entry: TimeEntry
  /** canReconcileAttendance — times, note, breaks. */
  canEdit?: boolean
  /** canDeleteAttendance — the Remove button. */
  canDelete?: boolean
}) {
  const vm = useEditEntryDialog({ entry, canEdit, canDelete })
  const {
    t,
    user,
    open,
    setOpen,
    tz,
    clockIn,
    setClockIn,
    clockOut,
    setClockOut,
    notes,
    setNotes,
    reason,
    setReason,
    confirmDelete,
    setConfirmDelete,
    addingBreak,
    setAddingBreak,
    breakStart,
    setBreakStart,
    breakEnd,
    setBreakEnd,
    breakType,
    setBreakType,
    breakReason,
    setBreakReason,
    removingBreaks,
    setRemovingBreaks,
    pendingBreaks,
    setPendingBreaks,
    typedBreak,
    existingBreaks,
    changeTz,
    openWith,
    mutation,
    remove,
    clockOutBeforeIn,
    busy,
    canSubmit,
  } = vm

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
              name: personName(entry.user),
            })}
          </DialogDescription>
        </DialogHeader>

        {/* A disabled fieldset disables every control inside it, the break
            list's buttons included — read-only without a second copy of the form. */}
        <fieldset disabled={!canEdit} className="contents">
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

          {/*
            Adding a break to this shift.

            Here rather than on its own screen because the shift is already in
            front of you, in ITS timezone — the same `tz` the clock times use, so
            a break entered as 12:00 means noon where the member worked, not noon
            where the person correcting it happens to be sitting.

            Collapsed by default: correcting a break is the exception, and a form
            that is always open reads as something you are expected to fill in.
          */}
          <EditEntryDialogAddBreak vm={vm} />

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
        </fieldset>

        <DialogFooter className={canDelete ? "sm:justify-between" : "sm:justify-end"}>
          {canDelete && (
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
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            {canEdit && (
              <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("attendance.editEntry.save")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
