"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Wallet, Clock, CalendarDays } from "lucide-react"

import { analyticsApi, type WorkerCostRow } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

/** Current month as YYYY-MM (UTC), the default period. */
function currentMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** EUR cents → "€1,234.50". */
function eur(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(cents / 100)
}

export default function CostsPage() {
  const { t } = useTranslation()
  const [month, setMonth] = useState(currentMonth())

  const { data, isLoading } = useQuery({
    queryKey: ["worker-costs", month],
    queryFn: () => analyticsApi.workerCosts(month),
    staleTime: 60000,
  })

  const workers: WorkerCostRow[] = data?.workers ?? []
  const totalCents = data?.totalCents ?? 0

  const rateLabel = useMemo(
    () => (w: WorkerCostRow) => {
      if (w.costType === "HOURLY") return `${eur(w.costRateCents ?? 0)} ${t("costs.perHour", "/ hour")}`
      if (w.costType === "FIXED") return `${eur(w.costRateCents ?? 0)} ${t("costs.perMonth", "/ month")}`
      return "—"
    },
    [t],
  )

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <Wallet className="h-6 w-6 text-blue-600" />
              {t("costs.title", "Worker costs")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("costs.subtitle", "What each worker costs you this month — hourly (hours × rate) or fixed monthly.")}
            </p>
          </div>
          <div className="w-44">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value || currentMonth())} />
          </div>
        </div>

        {/* Total */}
        <Card className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("costs.monthTotal", "Total for the month")}</p>
              <p className="text-2xl font-semibold text-foreground">{eur(totalCents)}</p>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">
            {t("costs.workerCount", "{{count}} costed", { count: workers.length })}
          </span>
        </Card>

        {/* Per-worker table */}
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-border px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <div>{t("costs.worker", "Worker")}</div>
            <div className="text-right">{t("costs.rate", "Rate")}</div>
            <div className="text-right">{t("costs.hours", "Hours")}</div>
            <div className="text-right">{t("costs.cost", "Cost")}</div>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : workers.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {t("costs.empty", "No worker has a cost set yet. Add an hourly or fixed monthly cost from a member's Edit dialog.")}
            </div>
          ) : (
            workers.map((w) => (
              <div
                key={w.userId}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-border px-6 py-3 text-sm last:border-b-0"
              >
                <div className="font-medium text-foreground">{w.name}</div>
                <div className="whitespace-nowrap text-right text-muted-foreground">{rateLabel(w)}</div>
                <div className="text-right text-muted-foreground">
                  {w.costType === "HOURLY" ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {w.hours.toFixed(1)}
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="text-right font-semibold text-foreground">{eur(w.costCents)}</div>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}
