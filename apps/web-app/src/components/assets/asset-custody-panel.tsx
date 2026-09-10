"use client"

import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowRightLeft, CircleDot, Clock } from "lucide-react"

import { assetsApi, type CustodyPeriodDto } from "@/lib/api"
import { custodyDays, formatCents, type KindShape } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AssetHandoverDialog } from "./asset-handover-dialog"
import { initials } from "./holder-picker"

/**
 * Who has had this, and what it cost each of them.
 *
 * The costs are NOT stored against a holder. Every entry carries the date the
 * money moved, and the split is computed from the periods — so correcting a
 * handover date corrects the figures with it, and there is never a second
 * version of the truth to reconcile.
 */
export function AssetCustodyPanel({
  assetId,
  shape,
  canManage,
}: {
  assetId: string
  shape: KindShape
  canManage: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ["asset-custody", assetId],
    queryFn: () => assetsApi.getCustody(assetId),
  })

  const periods = q.data?.periods ?? []
  const unattributed = q.data?.unattributed

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["asset-custody", assetId] })
    // The record header and the ledger both read who holds it.
    qc.invalidateQueries({ queryKey: ["asset", assetId] })
    qc.invalidateQueries({ queryKey: ["asset-money", assetId] })
  }

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {canManage && shape.holder.enabled && (
        <div className="flex justify-end">
          <AssetHandoverDialog
            assetId={assetId}
            shape={shape}
            periods={periods}
            onDone={refresh}
            trigger={
              <Button variant="outline" size="sm">
                <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                {t("custody.handOver", "Hand it over")}
              </Button>
            }
          />
        </div>
      )}

      {periods.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("custody.empty", "Nobody has held this yet.")}
        </p>
      ) : (
        /*
          A rail down the left, one node per period. It is a timeline because
          the question people arrive with is "when", not "who" — "who" is
          already answered by the panel beside the record.
        */
        <ol className="relative space-y-2 border-l border-border/70 pl-5">
          {periods.map((p) => <PeriodRow key={p.id} period={p} />)}
        </ol>
      )}

      {/*
        Money that falls in no period is REAL and is deliberately shown. Hidden,
        the breakdown and the ledger would disagree and neither would look wrong
        on its own — a van's delivery invoice predates every driver it ever had.
      */}
      {unattributed && unattributed.entries > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground">
            {t("custody.unattributed", "Outside anybody’s custody")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("custody.unattributedHint", "{{count}} entries dated when nobody held it — the organisation’s own cost.", {
              count: unattributed.entries,
            })}
          </p>
          <p className="mt-1.5 text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
            {formatCents(unattributed.outCents)}
          </p>
        </div>
      )}
    </div>
  )
}

function PeriodRow({ period }: { period: CustodyPeriodDto }) {
  const { t } = useTranslation()
  const open = !period.endedAt
  const name = period.user
    ? `${period.user.firstName ?? ""} ${period.user.lastName ?? ""}`.trim() || period.user.email || "—"
    : period.customer?.name ?? t("assetRecords.formerMember", "Former member")
  const days = custodyDays(period as never)
  const href = period.userId ? `/members/${period.userId}` : period.customerId ? `/customers/${period.customerId}` : null

  const body = (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
          {name}
          {open && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <CircleDot className="h-2.5 w-2.5" /> {t("custody.now", "Has it now")}
            </span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {new Date(period.startedAt).toLocaleDateString()}
          {" – "}
          {period.endedAt ? new Date(period.endedAt).toLocaleDateString() : t("custody.present", "now")}
          {" · "}
          {t("custody.days", "{{count}} days", { count: days })}
        </p>
        {period.reason && <p className="mt-0.5 truncate text-xs text-muted-foreground">{period.reason}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={cn(
          "text-sm font-semibold tabular-nums",
          period.totals.netCents >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
        )}>
          {period.totals.netCents >= 0 ? "+" : "−"} {formatCents(Math.abs(period.totals.netCents))}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t("custody.entriesCount", "{{count}} entries", { count: period.totals.entries })}
        </p>
      </div>
    </div>
  )

  return (
    <li className="relative">
      <span className={cn(
        "absolute -left-[1.4rem] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-background",
        open ? "bg-emerald-500" : "bg-border",
      )} />
      {href ? <Link href={href}>{body}</Link> : body}
    </li>
  )
}
