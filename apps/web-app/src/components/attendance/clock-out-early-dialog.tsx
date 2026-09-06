"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { LogOut, Loader2, AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTimeFormat } from "@/hooks"

/**
 * "You are 1h 20m short of your shift."
 *
 * Asks, and does not block. A person may always stop working — a time system
 * that refuses a clock-out is one people work around, and then it records
 * nothing at all. What this buys is the reason, at the moment somebody still
 * remembers it, on its way to whoever is responsible.
 */
export interface ClockOutEarlyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shortfallMinutes: number
  expectedClockOutAt: string | null
  timezone?: string | null
  pending?: boolean
  onConfirm: (reason: string) => void
}

export function ClockOutEarlyDialog({
  open,
  onOpenChange,
  shortfallMinutes,
  expectedClockOutAt,
  timezone,
  pending,
  onConfirm,
}: ClockOutEarlyDialogProps) {
  const { t } = useTranslation()
  const { formatTime } = useTimeFormat()
  const [reason, setReason] = useState("")

  const h = Math.floor(shortfallMinutes / 60)
  const m = shortfallMinutes % 60
  const short = h > 0 ? `${h}h ${m}m` : `${m}m`

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("")
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t("attendance.early.title", "You are {{short}} short of your shift", { short })}
          </DialogTitle>
          <DialogDescription>
            {expectedClockOutAt
              ? t("attendance.early.body", "Your shift runs to {{end}}. You can still clock out — tell us why, and it goes to whoever is responsible with the entry.", {
                  end: formatTime(expectedClockOutAt, timezone ?? undefined),
                })
              : t("attendance.early.bodyNoEnd", "You can still clock out — tell us why, and it goes to whoever is responsible with the entry.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="early-reason">{t("attendance.early.reason", "Reason")}</Label>
          <Input
            id="early-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("attendance.early.placeholder", "Sent home early, appointment, finished the job…")}
            maxLength={500}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !pending) onConfirm(reason.trim())
            }}
          />
          {/* Optional, and said so — an empty box that blocks the button is how a
              dialog teaches people to type a full stop. */}
          <p className="text-[11px] text-muted-foreground">
            {t("attendance.early.optional", "Optional, but it saves the question later.")}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("attendance.early.keepWorking", "Keep working")}
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => onConfirm(reason.trim())}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {t("attendance.early.confirm", "Clock out anyway")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
