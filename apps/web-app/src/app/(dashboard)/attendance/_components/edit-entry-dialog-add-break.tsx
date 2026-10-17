"use client"

import { formatDuration, personName } from "@hbcfield/shared/client"
import { BreakFields } from "@/components/attendance/break-fields"
import { Pencil, Trash2, Coffee, UtensilsCrossed, Pause, Plus } from "lucide-react"
import { cn, utcToZonedInput, zonedInputToUtc } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { EditEntryDialogState } from "./use-edit-entry-dialog"

/** Part of EditEntryDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function EditEntryDialogAddBreak({ vm }: { vm: EditEntryDialogState }) {
  const {
    setAddingBreak,
    t,
    existingBreaks,
    removingBreaks,
    pendingBreaks,
    typedBreak,
    addingBreak,
    tz,
    setRemovingBreaks,
    setBreakStart,
    setBreakEnd,
    setBreakType,
    setBreakReason,
    setPendingBreaks,
    breakStart,
    breakEnd,
    breakType,
    breakReason,
    clockIn,
    clockOut,
  } = vm
  return (
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
            {formatDuration(
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
                  "group flex items-center gap-3 px-3 py-2.5",
                  marked && "opacity-45",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    b.type === "LUNCH"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : b.type === "SHORT"
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {b.type === "LUNCH" ? (
                    <UtensilsCrossed className="size-3.5" />
                  ) : b.type === "SHORT" ? (
                    <Coffee className="size-3.5" />
                  ) : (
                    <Pause className="size-3.5" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className={cn("block text-xs font-medium text-foreground", marked && "line-through")}>
                    {utcToZonedInput(b.startedAt, tz).slice(11)}
                    {b.endedAt ? `–${utcToZonedInput(b.endedAt, tz).slice(11)}` : ""}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {formatDuration(b.durationMinutes ?? 0)}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground" title={b.reason || undefined}>
                    {b.addedBy
                      ? t("attendance.breaks.addedBy", "Added by {{name}}", {
                          name: personName(b.addedBy),
                        })
                      : t("attendance.addBreak.byMember", "Recorded by the member")}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </span>
                </span>

                {marked ? (
                  <button
                    type="button"
                    className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setRemovingBreaks((cur) => cur.filter((id) => id !== b.id))}
                  >
                    {t("common.undo", "Undo")}
                  </button>
                ) : (
                  <span className="flex shrink-0 items-center gap-0.5">
                    {/*
                      Edit is remove-and-re-add, done for you.

                      It loads this break into the form and marks the old
                      one for removal, so Save writes the corrected one —
                      no second endpoint repeating the window and overlap
                      checks, and nobody retypes a reason to change a time.
                    */}
                    <button
                      type="button"
                      title={t("common.edit", "Edit")}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        setBreakStart(utcToZonedInput(b.startedAt, tz))
                        setBreakEnd(b.endedAt ? utcToZonedInput(b.endedAt, tz) : "")
                        setBreakType((b.type as "SHORT" | "LUNCH" | "OTHER") ?? "SHORT")
                        setBreakReason(b.reason || t("attendance.addBreak.editedReason", "Corrected"))
                        setRemovingBreaks((cur) => (cur.includes(b.id) ? cur : [...cur, b.id]))
                        setAddingBreak(true)
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("common.remove", "Remove")}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRemovingBreaks((cur) => [...cur, b.id])}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
          {pendingBreaks.map((b, i) => (
            <li key={`pending-${i}`} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className={"flex size-7 shrink-0 items-center justify-center rounded-full border " +
                  "border-dashed border-amber-500/50 text-amber-600 dark:text-amber-400"}>
                <Plus className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">
                  {b.label}
                  <span className="ml-1.5 font-normal text-amber-600 dark:text-amber-400">
                    {t("attendance.addBreak.pending", "on save")}
                  </span>
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {t(`attendance.breaks.typeBreak.${b.type.toLowerCase()}`, b.type)} · {b.reason}
                </span>
              </span>
              <button
                type="button"
                title={t("common.remove", "Remove")}
                className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setPendingBreaks((cur) => cur.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {addingBreak && (
        <div className="space-y-3 border-t border-border p-3">
          {/*
            The same fields the Add-attendance dialog uses. It asked for a
            number of minutes — a different form for one thing, and behind
            it a different record, since that number never became a break.
          */}
          <BreakFields
            mode="datetime"
            start={breakStart}
            end={breakEnd}
            kind={breakType}
            reason={breakReason}
            onStart={setBreakStart}
            onEnd={setBreakEnd}
            onKind={setBreakType}
            onReason={setBreakReason}
            min={clockIn || undefined}
            max={clockOut || undefined}
            hint={t(
              "attendance.addBreak.hint",
              "Breaks are normally recorded by the member. One added here is marked with your name and the reason.",
            )}
          />
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
  )
}
