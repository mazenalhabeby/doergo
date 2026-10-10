"use client"

import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { Clock } from "lucide-react"

import type { MaintenanceHistoryItem } from "@/lib/api"
import { personName } from "@hbcfield/shared/client"
import { AssetServiceReports } from "@/components/assets/asset-service-reports"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DONE } from "../_lib/asset-detail"

/** The Jobs tab: every task raised against this thing, and the reports under them. */
export function AssetJobsPanel({
  assetId, loading, tasks,
}: {
  assetId: string
  loading: boolean
  tasks: MaintenanceHistoryItem[]
}) {
  const { t } = useTranslation()
  const router = useRouter()

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    )
  }
  if (tasks.length === 0) {
    return (
      <div className="space-y-2">
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("assetRecords.noHistory", "No tasks for this yet.")}
        </p>
        <AssetServiceReports assetId={assetId} />
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {tasks.map((tk) => (
        <button
          key={tk.id}
          onClick={() => router.push(`/tasks/${tk.id}`)}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
        >
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-foreground">{tk.title}</span>
            {tk.assignedTo && (
              <span className="block truncate text-[11px] text-muted-foreground">
                {personName(tk.assignedTo)}
              </span>
            )}
          </span>
          <Badge
            variant={DONE.includes(tk.status) ? "outline" : "secondary"}
            className="shrink-0 text-[10px]"
          >
            {tk.status}
          </Badge>
        </button>
      ))}
      {/* What was done, under what was asked for. */}
      <AssetServiceReports assetId={assetId} />
    </div>
  )
}
