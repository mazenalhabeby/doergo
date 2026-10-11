"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { MANUAL_ADJUSTMENT_KINDS, LEAVE_ADJUSTMENT_LIMITS, parseLeaveAdjustment, type LeaveAdjustmentKind } from "@hbcfield/shared/client"
import { leaveLedgerApi } from "@/lib/api"
import { todayKey } from "@/lib/leave-ledger"
import { serverErrorMessage } from "@/lib/server-error"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * One hand-entered line on a member's leave ledger: used before HBCField, a
 * correction, or extra days granted. Read by the shared `parseLeaveAdjustment`
 * BEFORE it is sent — the same function the server reads it with — so a
 * refusal is said here, in the reader's language, not after a round trip.
 */
export function AddAdjustmentDialog({
  memberId,
  memberName,
  open,
  onOpenChange,
  onSaved,
}: {
  memberId: string
  memberName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<LeaveAdjustmentKind>("CORRECTION")
  const [days, setDays] = useState("")
  const [on, setOn] = useState(todayKey())
  const [reason, setReason] = useState("")
  const [tried, setTried] = useState(false)

  // A fresh dialog is a fresh line — never the last one's numbers.
  useEffect(() => {
    if (!open) return
    setKind("CORRECTION"); setDays(""); setOn(todayKey()); setReason(""); setTried(false)
  }, [open])

  const parsed = useMemo(() => parseLeaveAdjustment({ kind, days, on, reason }), [kind, days, on, reason])

  const save = useMutation({
    mutationFn: () => {
      if (!parsed.ok) throw new Error(t(`serverErrors.${parsed.code}`))
      return leaveLedgerApi.addAdjustment(memberId, parsed.value)
    },
    onSuccess: () => {
      notify.success(t("leaveLedger.adjust.saved"))
      onSaved()
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(serverErrorMessage(e, t) || t("common.error")),
  })

  const submit = () => {
    setTried(true)
    if (parsed.ok) save.mutate()
  }

  const reasonRequired = kind === "CORRECTION" || kind === "GRANT"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leaveLedger.adjust.title")}</DialogTitle>
          <DialogDescription>{t("leaveLedger.adjust.description", { name: memberName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium">{t("leaveLedger.adjust.kind")}</legend>
            {MANUAL_ADJUSTMENT_KINDS.map((k) => (
              <label
                key={k}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  kind === k ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
                )}
              >
                <input
                  type="radio"
                  name="adjustment-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="mt-1 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{t(`leaveLedger.kinds.${k}.label`)}</span>
                  <span className="block text-xs text-muted-foreground">{t(`leaveLedger.kinds.${k}.hint`)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adj-days">{t("leaveLedger.adjust.days")}</Label>
              <Input
                id="adj-days"
                inputMode="decimal"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder={kind === "CORRECTION" ? "-1,5" : "1,5"}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-on">{t("leaveLedger.adjust.date")}</Label>
              <Input id="adj-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t(`leaveLedger.kinds.${kind}.daysHint`)}</p>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">
              {t("leaveLedger.adjust.reason")}
              {!reasonRequired && <span className="ml-1 font-normal text-muted-foreground">{t("leaveLedger.adjust.optional")}</span>}
            </Label>
            <Textarea
              id="adj-reason"
              rows={3}
              maxLength={LEAVE_ADJUSTMENT_LIMITS.REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("leaveLedger.adjust.reasonPlaceholder")}
            />
          </div>

          {tried && !parsed.ok && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">{t(`serverErrors.${parsed.code}`)}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("leaveLedger.adjust.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
