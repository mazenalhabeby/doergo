"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { ArrowRightLeft, Loader2, UserMinus, UserPlus } from "lucide-react"

import { assetsApi, type CustodyPeriodDto } from "@/lib/api"
import {
  planHandover, canHandOver, type CustodyPeriod, type KindShape,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import { HolderPicker, decodeHolders, encodeHolderList, type HolderKey } from "./holder-picker"

/**
 * Hand something over — and see, before agreeing to it, exactly what that does.
 *
 * ⚠️ The list of consequences is not written here. `planHandover` in shared
 * decides what a handover closes and opens, this renders that plan, and the
 * server executes the SAME function. A dialog that described the change in its
 * own words would eventually describe a change the server did not make — and
 * this is a screen where somebody is agreeing to a change of who is responsible
 * for a vehicle.
 */
export function AssetHandoverDialog({
  assetId,
  shape,
  periods,
  trigger,
  onDone,
}: {
  assetId: string
  shape: KindShape
  /** The asset's periods, as the timeline read them. Only the open ones matter. */
  periods: CustodyPeriodDto[]
  trigger: React.ReactNode
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState<HolderKey[]>([])
  const [reason, setReason] = useState("")

  const openPeriods = periods.filter((p) => !p.endedAt)
  const nameOf = (p: CustodyPeriodDto) =>
    p.user ? `${p.user.firstName ?? ""} ${p.user.lastName ?? ""}`.trim() || p.user.email || "—"
      : p.customer?.name ?? "—"

  const plan = planHandover({
    periods: openPeriods as unknown as CustodyPeriod[],
    to: decodeHolders(to),
    limit: shape.holder.multiple ? 50 : 1,
  })
  const ready = canHandOver(plan)

  const hand = useMutation({
    mutationFn: () => assetsApi.handOver(assetId, { to: decodeHolders(to), reason: reason.trim() || undefined }),
    onSuccess: () => {
      notify.success(t("custody.done", "Handed over."))
      setOpen(false)
      onDone()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const reset = (next: boolean) => {
    if (next) {
      // Opens on WHOEVER HAS IT, not on nobody. A picker that starts empty means
      // the commonest action — "same person, no change" — looks like "take it
      // off them", and the second commonest is one tap from being a mistake.
      setTo(encodeHolderList(openPeriods))
      setReason("")
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            {t("custody.handOver", "Hand it over")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("custody.whoGetsIt", "Who gets it")}</Label>
            <HolderPicker
              shape={shape}
              value={to}
              onChange={setTo}
              enabled={open}
              showChips={shape.holder.multiple}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("custody.reason", "Why (optional)")}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("custody.reasonPh", "Rental ended, moved depot…")}
              maxLength={300}
            />
          </div>

          {/*
            What this will actually do. Rendered from the plan, so it cannot
            promise something the server will not carry out.
          */}
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("custody.whatHappens", "What happens")}
            </p>
            {!ready && plan.problems.some((p) => p.kind === "nobody") ? (
              <p className="text-sm text-muted-foreground">
                {t("custody.noChange", "Nothing changes — that is who has it already.")}
              </p>
            ) : !ready && plan.problems.some((p) => p.kind === "too-many") ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {t("custody.oneAtATime", "This type is held by one at a time.")}
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {plan.closing.map((p, i) => (
                  <li key={`c${i}`} className="flex items-start gap-2 text-foreground">
                    <UserMinus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      {t("custody.closes", "Closes {{name}}’s custody, and everything after today stops counting against them.", {
                        name: nameOf(p as unknown as CustodyPeriodDto),
                      })}
                    </span>
                  </li>
                ))}
                {plan.opening.length > 0 && (
                  <li className="flex items-start gap-2 text-foreground">
                    <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {t("custody.opens", "Opens a new custody from now. Costs dated after this belong to them.")}
                    </span>
                  </li>
                )}
                {plan.opening.length === 0 && plan.closing.length > 0 && (
                  <li className="flex items-start gap-2 text-muted-foreground">
                    <UserMinus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{t("custody.toNobody", "Nobody holds it after this.")}</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => reset(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!ready || hand.isPending} onClick={() => hand.mutate()}>
            {hand.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("custody.confirm", "Confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
