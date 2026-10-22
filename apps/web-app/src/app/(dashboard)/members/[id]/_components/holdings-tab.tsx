"use client"

import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Package } from "lucide-react"

import { assetsApi, type CustodyPeriodDto } from "@/lib/api"
import { custodyDays, formatCents } from "@hbcfield/shared/client"
import { CustodySpan, HasItNowBadge } from "@/components/assets/custody-period"
import { Skeleton } from "@/components/ui/skeleton"
import { keys } from "@/lib/query-keys"
import { DashedEmptyBox } from "@/components/ui/empty-note"
import { StatTile } from "@/components/ui/stat-tile"

/**
 * What this member has, and what they have had.
 *
 * The other half of the asset's own timeline — the same rows, read the other
 * way round, which is exactly why custody is a table rather than a note on an
 * activity entry. "Which vans has Ahmed had this year, and what did each cost"
 * is a question the record of "who has it now" could never answer.
 */
export function HoldingsTab({ memberId }: { memberId: string }) {
  const { t } = useTranslation()

  const q = useQuery({
    queryKey: keys.memberRecord.custody(memberId),
    queryFn: () => assetsApi.getMemberCustody(memberId),
    enabled: !!memberId,
  })

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const periods = q.data ?? []
  const now = periods.filter((p) => !p.endedAt)
  const past = periods.filter((p) => p.endedAt)

  if (periods.length === 0) {
    return (
      <DashedEmptyBox icon={Package}>
        {t("custody.memberEmpty", "Nothing has been handed to this member.")}
      </DashedEmptyBox>
    )
  }

  /*
    Totalled over CLOSED periods as well as open ones. The question the office
    asks is "what has this person cost us in vehicles", and leaving out the car
    they gave back six months ago answers a different, more flattering one.
  */
  const spend = periods.reduce((n, p) => n + p.totals.outCents, 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-3">
        <StatTile size="sm" label={t("custody.holdingNow", "Holding now")} value={String(now.length)} />
        <StatTile size="sm" label={t("custody.everHeld", "Held in total")} value={String(periods.length)} />
        <StatTile
          size="sm"
          label={t("custody.spendTotal", "Spent on them")}
          value={formatCents(spend)}
          tone="warning"
        />
      </div>

      {now.length > 0 && (
        <Section title={t("custody.holdingNow", "Holding now")}>
          {now.map((p) => (
            <HoldingRow key={p.id} period={p} />
          ))}
        </Section>
      )}
      {past.length > 0 && (
        <Section title={t("custody.previously", "Previously")}>
          {past.map((p) => (
            <HoldingRow key={p.id} period={p} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function HoldingRow({ period }: { period: CustodyPeriodDto }) {
  const { t } = useTranslation()
  const open = !period.endedAt
  const days = custodyDays(period as never)

  return (
    <Link
      href={`/assets/${period.assetId}`}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${period.asset?.category?.color ?? "#2563EB"}1a` }}
      >
        <Package className="h-4 w-4" style={{ color: period.asset?.category?.color ?? "#2563EB" }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
          {period.asset?.name ?? t("custody.anAsset", "An asset")}
          {open && <HasItNowBadge />}
        </p>
        <CustodySpan startedAt={period.startedAt} endedAt={period.endedAt} days={days} />
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
          {formatCents(period.totals.outCents)}
        </p>
        <p className="text-[11px] text-muted-foreground">{t("custody.whileHeld", "while they had it")}</p>
      </div>
    </Link>
  )
}
