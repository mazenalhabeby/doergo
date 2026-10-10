"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, UserCheck } from "lucide-react"
import { personName, OFFICE_START_REASON_MAX } from "@hbcfield/shared/client"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"
import type { OnBehalf } from "@/lib/api"

/** `yyyy-MM-ddTHH:mm` in the browser's own zone — what <input type="datetime-local"> reads and writes. */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * "Start this job for Mike?" — the office's start, said out loud: a reason
 * (required), when it really started (never before their clock-in), and the
 * line the job's history will carry. Presentation only: `useOfficeStart`
 * opens it on the server's refusal and repeats the move.
 */
export function OfficeStartDialog({
  open, name, clockInAt, pending, onClose, onConfirm,
}: {
  open: boolean
  name: string
  clockInAt: string | null
  pending: boolean
  onClose: () => void
  onConfirm: (onBehalf: OnBehalf) => void
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [reason, setReason] = useState("")
  const [at, setAt] = useState("")
  useEffect(() => { if (open) { setReason(""); setAt(localInput(new Date())) } }, [open])

  const min = clockInAt ? localInput(new Date(clockInAt)) : undefined
  const max = localInput(new Date())
  const chosen = at ? new Date(at) : null
  const outside = !!chosen && ((clockInAt && chosen < new Date(clockInAt)) || chosen.getTime() > Date.now() + 60_000)
  const me = personName(user)
  const preview = useMemo(
    () => t("tasks.officeStart.preview", { me, name, time: chosen ? chosen.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "", reason: reason.trim() }),
    [t, me, name, chosen, reason],
  )

  const submit = () => {
    if (!reason.trim() || outside) return
    // Only send a time when it is not "now" — the server's own clock is better than the browser's.
    const sendAt = chosen && Date.now() - chosen.getTime() > 2 * 60_000 ? chosen.toISOString() : undefined
    onConfirm({ reason: reason.trim(), ...(sendAt ? { at: sendAt } : {}) })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            {t("tasks.officeStart.title", { name })}
          </DialogTitle>
          <DialogDescription>{t("tasks.officeStart.body", { name })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="office-start-reason">{t("tasks.officeStart.reason")}</Label>
            <Input
              id="office-start-reason"
              value={reason}
              autoFocus
              maxLength={OFFICE_START_REASON_MAX}
              placeholder={t("tasks.officeStart.reasonPlaceholder")}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="office-start-at">{t("tasks.officeStart.startedAt")}</Label>
            <Input id="office-start-at" type="datetime-local" value={at} min={min} max={max} onChange={(e) => setAt(e.target.value)} />
            <p className={outside ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {clockInAt
                ? t("tasks.officeStart.notBefore", { name, time: new Date(clockInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
                : t("tasks.officeStart.noClock")}
            </p>
          </div>
          {reason.trim() ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">{preview}</div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !reason.trim() || outside}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("tasks.officeStart.confirm", { name })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
