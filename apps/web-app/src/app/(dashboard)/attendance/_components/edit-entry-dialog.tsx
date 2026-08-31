"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Loader2, Trash2, Coffee } from "lucide-react"

import { attendanceApi, type TimeEntry } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn, utcToZonedInput, zonedInputToUtc, formatDurationMinutes } from "@/lib/utils"

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
  const [addingBreak, setAddingBreak] = useState(false)
  const [breakStart, setBreakStart] = useState("")
  const [breakEnd, setBreakEnd] = useState("")
  const [breakType, setBreakType] = useState<"SHORT" | "LUNCH" | "OTHER">("SHORT")
  const [breakReason, setBreakReason] = useState("")
  /*
    Breaks wait for Save; they are not written the moment you add one.

    Two reasons, both learned the hard way. The server validates a break against
    the shift's CURRENT times, so adding one while the clock times are still
    unsaved is checked against the old shift and refused — you had to save the
    times, reopen, then add the break. And a dialog with its own Save inside
    another Save asks somebody to guess which button commits what.

    So the form queues, and one Save applies the edits first and then the breaks,
    in that order, against times the server has already accepted.
  */
  /*
    Breaks marked for removal, held until Save like the additions are.

    Mixing an immediate delete with a queued add is the inconsistency that made
    this dialog confusing in the first place — one button commits everything or
    the buttons stop meaning anything.
  */
  const [removingBreaks, setRemovingBreaks] = useState<string[]>([])
  const [pendingBreaks, setPendingBreaks] = useState<
    { type: "SHORT" | "LUNCH" | "OTHER"; startedAt: string; endedAt: string; reason: string; label: string }[]
  >([])

  /**
   * The break currently typed into the form, if it is complete.
   *
   * "Add to list" exists for entering SEVERAL breaks, but filling the form and
   * pressing Save is what somebody adding ONE will do — and losing it there,
   * silently, because of an extra click they had no reason to expect, is the
   * worst possible outcome for a form about somebody's paid hours.
   *
   * So a completed form counts: towards the total shown in the header, and in
   * what Save writes. Filling it in IS the intent; the extra button is a
   * convenience for the second one, not a toll on the first.
   */
  const typedBreak = useMemo(() => {
    if (!breakStart || !breakEnd || breakReason.trim().length < 3) return null
    const startedAt = zonedInputToUtc(breakStart, tz)
    const endedAt = zonedInputToUtc(breakEnd, tz)
    if (new Date(endedAt) <= new Date(startedAt)) return null
    return {
      type: breakType,
      startedAt,
      endedAt,
      reason: breakReason.trim(),
      label: `${breakStart.slice(11)}–${breakEnd.slice(11)}`,
    }
  }, [breakStart, breakEnd, breakType, breakReason, tz])

  /** The breaks already recorded on this shift — so the dialog shows what exists. */
  const { data: existingBreaks = [] } = useQuery({
    queryKey: ["entry-breaks", entry.id],
    queryFn: () => attendanceApi.entryBreaks(entry.id),
    enabled: open,
  })

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
      setPendingBreaks([])
      setRemovingBreaks([])
      setAddingBreak(false)
    }
    setOpen(next)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // Times first. A queued break is validated against the shift, so it has to
      // be checked against the times the server has just accepted — not the ones
      // it held when the dialog opened.
      await attendanceApi.editEntry(entry.id, {
        clockInAt: clockIn ? zonedInputToUtc(clockIn, tz) : undefined,
        clockOutAt: clockOut ? zonedInputToUtc(clockOut, tz) : undefined,
        notes: notes.trim() || undefined,
        timezone: tz || undefined,
        reason: reason.trim(),
      })
      // Sequentially, not in parallel: each is checked for overlap against the
      // ones already recorded, and two arriving at once can both pass a check
      // neither would pass afterwards.
      /*
        Removals BEFORE additions.

        Correcting a break is remove-then-add, and the new one usually occupies
        the slot the old one held. Adding first would collide with a break that
        is about to disappear.
      */
      for (const id of removingBreaks) {
        await attendanceApi.removeBreak(id)
      }
      // The queue, plus a completed form the person never pressed "Add another"
      // on — see `typedBreak`.
      for (const b of [...pendingBreaks, ...(typedBreak ? [typedBreak] : [])]) {
        await attendanceApi.addBreak(entry.id, {
          type: b.type, startedAt: b.startedAt, endedAt: b.endedAt, reason: b.reason,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
      queryClient.invalidateQueries({ queryKey: ["entry-breaks", entry.id] })
      queryClient.invalidateQueries({ queryKey: ["breaks"] })
      notify.success(t("attendance.editEntry.success"))
      setPendingBreaks([])
      setRemovingBreaks([])
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

          {/*
            Adding a break to this shift.

            Here rather than on its own screen because the shift is already in
            front of you, in ITS timezone — the same `tz` the clock times use, so
            a break entered as 12:00 means noon where the member worked, not noon
            where the person correcting it happens to be sitting.

            Collapsed by default: correcting a break is the exception, and a form
            that is always open reads as something you are expected to fill in.
          */}
          <div className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setAddingBreak((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-foreground"
            >
              <span className="flex items-center gap-2">
                <Coffee className="size-4 text-muted-foreground" />
                {t("attendance.addBreak.breaks", "Breaks")}
                {/* The total, because that is the number the row in the table
                    shows and the one that comes off the hours. */}
                <span className="text-xs font-normal text-muted-foreground">
                  {formatDurationMinutes(
                    existingBreaks
                      .filter((b) => !removingBreaks.includes(b.id))
                      .reduce((sum, b) => sum + (b.durationMinutes ?? 0), 0) +
                      [...pendingBreaks, ...(typedBreak ? [typedBreak] : [])].reduce(
                        (sum, b) =>
                          sum + Math.round((new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime()) / 60000),
                        0,
                      ),
                  )}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {addingBreak ? t("common.cancel") : t("common.add", "Add")}
              </span>
            </button>

            {/*
              What this shift already has, and what is waiting for Save.

              The panel used to show nothing but an empty form, so a shift with
              breaks looked like a shift without any — and a break you had just
              added disappeared from view the moment it was written. A member can
              take several in a day; they belong in a list.
            */}
            {(existingBreaks.length > 0 || pendingBreaks.length > 0) && (
              <ul className="divide-y divide-border border-t border-border">
                {existingBreaks.map((b) => {
                  const marked = removingBreaks.includes(b.id)
                  return (
                    <li
                      key={b.id}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2 text-xs",
                        marked && "opacity-50",
                      )}
                    >
                      <span className={cn("text-foreground", marked && "line-through")}>
                        {t(`attendance.breaks.typeBreak.${b.type.toLowerCase()}`, b.type)}
                        {" · "}
                        {formatDurationMinutes(b.durationMinutes ?? 0)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="truncate text-muted-foreground" title={b.reason || undefined}>
                          {b.addedBy
                            ? t("attendance.breaks.addedBy", "Added by {{name}}", {
                                name: `${b.addedBy.firstName} ${b.addedBy.lastName}`.trim(),
                              })
                            : t("attendance.addBreak.byMember", "Recorded by the member")}
                        </span>
                        {/* Marked, not deleted — Save commits it, so a mis-click
                            is undone by clicking again or by cancelling. */}
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setRemovingBreaks((cur) =>
                              marked ? cur.filter((id) => id !== b.id) : [...cur, b.id],
                            )
                          }
                        >
                          {marked ? t("common.undo", "Undo") : t("common.remove", "Remove")}
                        </button>
                      </span>
                    </li>
                  )
                })}
                {pendingBreaks.map((b, i) => (
                  <li key={`pending-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="text-foreground">
                      {t(`attendance.breaks.typeBreak.${b.type.toLowerCase()}`, b.type)} · {b.label}
                      <span className="ml-1.5 text-amber-600 dark:text-amber-400">
                        {t("attendance.addBreak.pending", "on save")}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingBreaks((cur) => cur.filter((_, j) => j !== i))}
                    >
                      {t("common.remove", "Remove")}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {addingBreak && (
              <div className="space-y-3 border-t border-border p-3">
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "attendance.addBreak.hint",
                    "Breaks are normally recorded by the member. One added here is marked with your name and the reason.",
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("attendance.addBreak.start", "Break start")}</Label>
                    <Input
                      type="datetime-local"
                      value={breakStart}
                      min={clockIn || undefined}
                      max={clockOut || undefined}
                      onChange={(e) => setBreakStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("attendance.addBreak.end", "Break end")}</Label>
                    <Input
                      type="datetime-local"
                      value={breakEnd}
                      min={breakStart || clockIn || undefined}
                      max={clockOut || undefined}
                      onChange={(e) => setBreakEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("attendance.addBreak.type", "Type")}</Label>
                  <div className="flex gap-1.5">
                    {(["SHORT", "LUNCH", "OTHER"] as const).map((bt) => (
                      <button
                        key={bt}
                        type="button"
                        aria-pressed={breakType === bt}
                        onClick={() => setBreakType(bt)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs",
                          breakType === bt
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t(`attendance.breaks.typeBreak.${bt.toLowerCase()}`, bt)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t("attendance.addBreak.reason", "Why")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={breakReason}
                    onChange={(e) => setBreakReason(e.target.value)}
                    placeholder={t("attendance.addBreak.reasonPlaceholder", "e.g. phone died before lunch")}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!breakStart || !breakEnd || breakReason.trim().length < 3}
                  onClick={() => {
                    // Queued, not sent. Save applies it after the time edits, so
                    // it is validated against the shift the server ends up with.
                    setPendingBreaks((cur) => [
                      ...cur,
                      {
                        type: breakType,
                        // Converted with the SAME zone the clock fields use.
                        startedAt: zonedInputToUtc(breakStart, tz),
                        endedAt: zonedInputToUtc(breakEnd, tz),
                        reason: breakReason.trim(),
                        label: `${breakStart.slice(11)}–${breakEnd.slice(11)}`,
                      },
                    ])
                    setBreakStart(""); setBreakEnd(""); setBreakReason("")
                  }}
                >
                  {t("attendance.addBreak.queue", "Add another")}
                </Button>
              </div>
            )}
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
