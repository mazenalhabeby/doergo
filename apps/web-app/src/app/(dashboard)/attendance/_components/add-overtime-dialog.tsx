"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, TimerReset } from "lucide-react"

import { attendanceApi, type TimeEntry } from "@/lib/api"
import { notify } from "@/lib/toast"
import { formatDurationMinutes } from "@/lib/utils"
import { overtimePreview } from "@/lib/overtime-preview"
import { useTimeFormat } from "@/hooks/use-time-format"
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
import { formatTime } from "./attendance-helpers"

/**
 * Overtime on a shift that is already closed — the member had no signal, or
 * never saw the prompt. The minutes run from the shift end and never past the
 * clock-out, so the preview is exactly what will be counted.
 */
export function AddOvertimeDialog({ entry }: { entry: TimeEntry }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { hour12, locale } = useTimeFormat()
  const tz = entry.timezone ?? entry.location?.timezone ?? undefined
  const initial = overtimePreview(entry, 0)
  const [open, setOpen] = useState(false)
  const [minutes, setMinutes] = useState(String(initial?.suggested ?? 30))
  const [reason, setReason] = useState("")

  const value = Number(minutes)
  const valid = Number.isInteger(value) && value >= 1 && value <= 1440
  const preview = overtimePreview(entry, valid ? value : 0)

  const mutation = useMutation({
    mutationFn: () => attendanceApi.addOvertime(entry.id, { minutes: value, reason: reason.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
      // The member's own attendance tab offers the same action, keyed
      // ["memberAttendance", memberId, from, to] — a prefix reaches every range.
      queryClient.invalidateQueries({ queryKey: ["memberAttendance"] })
      notify.success(t("attendance.addOvertime.success", { minutes: value, defaultValue: `Added ${value} min of overtime` }))
      setOpen(false)
    },
    onError: (err: Error) => notify.error(err.message || t("attendance.addOvertime.error", "Could not add overtime")),
  })

  if (!initial) return null
  const name = `${entry.user?.firstName ?? ""} ${entry.user?.lastName ?? ""}`.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setMinutes(String(initial.suggested))
          setReason("")
        }
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t("attendance.addOvertime.action", "Add overtime")}
          aria-label={t("attendance.addOvertime.action", "Add overtime")}
        >
          <TimerReset className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>
            {name
              ? t("attendance.addOvertime.titleFor", { name, defaultValue: `Add overtime · ${name}` })
              : t("attendance.addOvertime.title", "Add overtime")}
          </DialogTitle>
          <DialogDescription>
            {t("attendance.addOvertime.context", {
              end: formatTime(entry.expectedClockOutAt ?? null, hour12, locale, tz),
              out: formatTime(entry.clockOutAt, hour12, locale, tz),
              minutes: initial.pastEnd,
              defaultValue: `Shift ended ${formatTime(entry.expectedClockOutAt ?? null, hour12, locale, tz)} · clocked out ${formatTime(entry.clockOutAt, hour12, locale, tz)} (${initial.pastEnd} min later)`,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`ot-minutes-${entry.id}`}>{t("attendance.addOvertime.minutes", "Minutes after the shift end")}</Label>
            <Input
              id={`ot-minutes-${entry.id}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`ot-reason-${entry.id}`}>{t("attendance.addOvertime.reason", "Reason")}</Label>
            <Textarea
              id={`ot-reason-${entry.id}`}
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("attendance.addOvertime.reasonPlaceholder", "Recorded with the approval")}
            />
          </div>

          {preview && valid && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">{t("attendance.addOvertime.countedUntil", "Counted until")}</dt>
              <dd className="text-right tabular-nums">{formatTime(preview.countedUntil, hour12, locale, tz)}</dd>
              {preview.countedBefore != null && preview.countedAfter != null && (
                <>
                  <dt className="text-muted-foreground">{t("attendance.addOvertime.countedTime", "Counted time")}</dt>
                  <dd className="text-right tabular-nums">
                    {formatDurationMinutes(preview.countedBefore)} → {formatDurationMinutes(preview.countedAfter)}
                  </dd>
                </>
              )}
              {value > initial.pastEnd && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  {t("attendance.addOvertime.cappedAtClockOut", "Time after the clock-out is never counted.")}
                </p>
              )}
            </dl>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("attendance.addOvertime.approve", { minutes: valid ? value : "", defaultValue: `Approve ${valid ? value : ""} min` })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
