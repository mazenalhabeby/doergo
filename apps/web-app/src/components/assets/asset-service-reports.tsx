"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { ClipboardCheck, Package, Timer } from "lucide-react"

import { reportsApi, type ServiceReportSummary } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"

/** Seconds of work → "1h 30m". The report stores seconds; nobody reads them. */
export function workDurationLabel(seconds: number | null | undefined): string | null {
  if (!seconds || seconds < 60) return null
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * What was actually done to this thing — the service reports, under its jobs.
 *
 * The endpoint existed and the client method existed; nothing called either,
 * so a machine's record listed "Replace compressor — Completed" and never what
 * the technician wrote, which parts went in, or how long it took. A job says
 * work was asked for; a report says what was done, and the record of a machine
 * is mostly the second.
 *
 * Renders nothing while there are none. A permanent empty section under an
 * empty jobs list says the same thing twice.
 */
export function AssetServiceReports({ assetId }: { assetId: string }) {
  const { t } = useTranslation()

  const q = useQuery({
    queryKey: ["asset-reports", assetId],
    queryFn: () => reportsApi.getAssetReports(assetId, { limit: 20 }),
    enabled: !!assetId,
  })

  const reports: ServiceReportSummary[] = q.data?.data ?? []

  if (q.isLoading) return <Skeleton className="h-16 w-full rounded-xl" />
  if (reports.length === 0) return null

  return (
    <section className="space-y-2 pt-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <ClipboardCheck className="h-3.5 w-3.5" /> {t("assetFacts.reports.title", "Service reports")}
      </h3>
      {reports.map((r) => {
        const who = r.completedBy ? `${r.completedBy.firstName ?? ""} ${r.completedBy.lastName ?? ""}`.trim() : ""
        const worked = workDurationLabel(r.workDuration)
        const parts = r.partsCount ?? 0
        return (
          <Link
            key={r.id}
            href={`/tasks/${r.taskId}`}
            className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="truncate text-sm font-medium text-foreground">{r.taskTitle}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(r.completedAt).toLocaleDateString()}
              </span>
            </div>
            {r.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.summary}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {who && <span>{t("assetFacts.reports.by", "by {{name}}", { name: who })}</span>}
              {parts > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {t("assetFacts.reports.parts", "{{count}} parts", { count: parts })}
                </span>
              )}
              {worked && (
                <span className="inline-flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  {t("assetFacts.reports.worked", "{{duration}} of work", { duration: worked })}
                </span>
              )}
            </div>
          </Link>
        )
      })}
    </section>
  )
}
