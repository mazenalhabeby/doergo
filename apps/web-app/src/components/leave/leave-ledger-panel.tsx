"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Scale, Undo2 } from "lucide-react"
import { personName } from "@hbcfield/shared/client"
import { employeesApi, leaveLedgerApi, type LeaveAdjustmentDto } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { formatSignedDays, todayKey } from "@/lib/leave-ledger"
import { dateLocale, formatMediumDate } from "@/lib/format-date"
import { serverErrorMessage } from "@/lib/server-error"
import { notify } from "@/lib/toast"
import { useLatched } from "@/hooks/use-latched"
import { useRouteAccess } from "@/hooks/use-route-access"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { LeaveBalanceBreakdown } from "./leave-balance-breakdown"

const AddAdjustmentDialog = dynamic(() => import("./add-adjustment-dialog").then((m) => m.AddAdjustmentDialog))

/**
 * A member's vacation balance and the lines it is built from — on their record.
 *
 * The balance is not a number anybody types: it is the allowance, plus every
 * line here, minus the vacation approved. Each line says how many days, why,
 * who wrote it and when; an undone line stays, struck through, so the history
 * of a balance is never rewritten. `canAdjust` mirrors the page's leave
 * approval gate; the server's `canEdit` for this person narrows it (scope, and
 * nobody adjusts their own) — and the server still decides every write.
 */
export function LeaveLedgerPanel({
  memberId,
  memberName,
  canAdjust,
}: {
  memberId: string
  memberName: string
  canAdjust: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const addMounted = useLatched(adding)
  const [confirmUndo, setConfirmUndo] = useState<string | null>(null)
  const on = todayKey()
  const opensOpening = useRouteAccess().may("/members/leave-opening")

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: keys.timeOff.myBalance(memberId),
    queryFn: () => employeesApi.getLeaveBalance(memberId),
    staleTime: 30_000,
  })
  // null = this server has no ledger yet: the balance still shows, the lines do not.
  const { data: ledger, isLoading: linesLoading } = useQuery({
    queryKey: keys.timeOff.ledger(memberId, on),
    queryFn: () => leaveLedgerApi.getAdjustments(memberId, on),
    staleTime: 30_000,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.timeOff.ledger(memberId) })
    qc.invalidateQueries({ queryKey: keys.timeOff.myBalance(memberId) })
    // The drawer and the member's own page read the same family.
    qc.invalidateQueries({ queryKey: keys.timeOff.myBalance() })
  }

  const undo = useMutation({
    mutationFn: (id: string) => leaveLedgerApi.voidAdjustment(id),
    onSuccess: () => {
      setConfirmUndo(null)
      notify.success(t("leaveLedger.ledger.undone"))
      refresh()
    },
    onError: (e: Error) => notify.error(serverErrorMessage(e, t) || t("common.error")),
  })

  if (balanceLoading) {
    return <Skeleton className="h-48 w-full rounded-2xl" />
  }
  if (!balance) return null
  const hasLedger = ledger !== null && ledger !== undefined
  const lines = ledger?.items ?? []
  // The page's gate (deciding leave) AND the server's answer for THIS person — nobody adjusts their own.
  const editable = canAdjust && ledger?.canEdit === true

  return (
    <section className="overflow-hidden rounded-[22px] border border-border bg-card shadow-shell">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border/60 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Scale className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("leaveLedger.ledger.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("leaveLedger.ledger.description")}</p>
        </div>
        {editable && (
          <div className="ml-auto flex items-center gap-2">
            {opensOpening && (
              <Link
                href="/members/leave-opening"
                className={
                  "text-xs font-medium text-muted-foreground underline-offset-2 " +
                  "hover:text-foreground hover:underline"
                }
              >
                {t("leaveLedger.opening.link")}
              </Link>
            )}
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("leaveLedger.ledger.add")}
            </Button>
          </div>
        )}
      </header>

      <div className={cn("grid gap-5 p-5", hasLedger && "lg:grid-cols-[minmax(0,20rem)_1fr]")}>
        <LeaveBalanceBreakdown balance={balance} className="h-fit" />

        {hasLedger && (
          <div className="min-w-0">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("leaveLedger.ledger.linesTitle")}
            </h3>
            {linesLoading ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : lines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                {t("leaveLedger.ledger.empty")}
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {lines.map((line) => (
                  <LedgerRow
                    key={line.id}
                    line={line}
                    canUndo={editable && !line.voidedAt}
                    confirming={confirmUndo === line.id}
                    pending={undo.isPending && undo.variables === line.id}
                    onAskUndo={() => setConfirmUndo(line.id)}
                    onCancelUndo={() => setConfirmUndo(null)}
                    onUndo={() => undo.mutate(line.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {addMounted && (
        <AddAdjustmentDialog
          memberId={memberId}
          memberName={memberName}
          open={adding}
          onOpenChange={setAdding}
          onSaved={refresh}
        />
      )}
    </section>
  )
}

function LedgerRow({
  line,
  canUndo,
  confirming,
  pending,
  onAskUndo,
  onCancelUndo,
  onUndo,
}: {
  line: LeaveAdjustmentDto
  canUndo: boolean
  confirming: boolean
  pending: boolean
  onAskUndo: () => void
  onCancelUndo: () => void
  onUndo: () => void
}) {
  const { t } = useTranslation()
  const voided = !!line.voidedAt
  const by = line.createdBy ? personName(line.createdBy) : t("leaveLedger.ledger.byRule")
  return (
    <li className={cn("px-3 py-2.5", voided && "bg-muted/30")}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "min-w-0 flex-1",
            voided && "text-muted-foreground line-through decoration-muted-foreground/60",
          )}
        >
          <p className="text-[13px] font-medium text-foreground">{t(`leaveLedger.lines.${line.kind}`)}</p>
          {line.reason && <p className="mt-0.5 text-xs text-muted-foreground">{line.reason}</p>}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("leaveLedger.ledger.byWhen", { name: by, date: formatMediumDate(line.createdAt) })}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 font-mono text-[13px] tabular-nums",
            voided ? "text-muted-foreground line-through" : line.days < 0 ? "text-foreground/80" : "text-shell-accent",
          )}
        >
          {formatSignedDays(line.days, dateLocale())}
        </span>
      </div>
      {voided && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {line.voidedBy
            ? t("leaveLedger.ledger.voidedByOn", {
                name: personName(line.voidedBy),
                date: formatMediumDate(line.voidedAt!),
              })
            : t("leaveLedger.ledger.voidedOn", { date: formatMediumDate(line.voidedAt!) })}
        </p>
      )}
      {canUndo && !confirming && (
        <button
          type="button"
          onClick={onAskUndo}
          className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
        >
          <Undo2 className="size-3" />
          {t("leaveLedger.ledger.undo")}
        </button>
      )}
      {canUndo && confirming && (
        /* Confirmed in place: the row says what undoing does, and asks once. */
        <div
          className={
            "mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] px-2.5 " +
            "py-2 text-[12px] text-shell-warn"
          }
        >
          <span className="min-w-0 flex-1">{t("leaveLedger.ledger.undoConfirm")}</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={onCancelUndo} disabled={pending}>
            {t("leaveLedger.ledger.keep")}
          </Button>
          <Button size="sm" variant="destructive" className="h-7" onClick={onUndo} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {t("leaveLedger.ledger.undoYes")}
          </Button>
        </div>
      )}
    </li>
  )
}
