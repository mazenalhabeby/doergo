"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"

import { assetsApi, type MaintenanceHistoryItem } from "@/lib/api"
import { normalizeKindShape, logTypesForKind, assetAccessIn } from "@hbcfield/shared/client"
import { AssetListTable } from "@/components/assets/asset-list-table"
import { AssetFaults } from "@/components/assets/asset-faults"
import { AssetCustodyPanel } from "@/components/assets/asset-custody-panel"
import { LogbookPanel } from "./_components/logbook-panel"
import { MoneyPanel } from "./_components/money-panel"
import { NoteBox, Timeline } from "./_components/asset-activity"
import { AssetAbout } from "./_components/asset-about"
import { AssetJobsPanel } from "./_components/asset-jobs-panel"
import { AssetRecordHeader } from "./_components/asset-record-header"
import { DONE, type AssetDetail } from "./_lib/asset-detail"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { keys } from "@/lib/query-keys"

/**
 * One thing you own — the page an apartment gets, drawn from its KIND.
 *
 * Same layout as an apartment: the map, who has it and what you record about it
 * down the left; what happened to it on the right. Every part appears because
 * the kind asked for it, so a van with no address simply has no map.
 */

export default function AssetRecordPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ""
  const qc = useQueryClient()
  const { user } = useAuth()
  // A list tab is keyed by its own name, so adding a list adds a tab.
  const [tab, setTab] = useState<string>("activity")

  const assetQ = useQuery({ queryKey: keys.assets.record(id), queryFn: () => assetsApi.getAsset(id), enabled: !!id })
  const asset = assetQ.data as unknown as AssetDetail | undefined
  /*
    Managing THIS asset is asked in its kind's workspace — an asset has no space
    of its own (`AssetCategory.spaceId`). A workspace manager, or an external
    member given "Manage" for their one workspace, holds it there and nowhere
    else; an org-level kind (no space) needs the org-wide grant.
    `assetAccessIn` treats an admin and a pre-capability token as org-wide.
  */
  const canManageAssets = !!user && assetAccessIn(user, "manage", asset?.category?.spaceId ?? null)

  const actQ = useQuery({
    queryKey: keys.assets.activities(id),
    queryFn: () => assetsApi.getActivities(id),
    enabled: !!asset,
  })
  const tasksQ = useQuery({
    queryKey: keys.assets.tasks(id),
    queryFn: () => assetsApi.getAssetHistory(id),
    enabled: !!asset,
  })
  /*
    The periods, read once here and shared.

    The ledger needs them to say WHO held it when each entry was dated — which
    is computed, never stored — and the Custody tab needs them to draw the
    timeline. One query, so the two can never show a different history.
  */
  const custodyQ = useQuery({
    queryKey: keys.assets.custody(id),
    queryFn: () => assetsApi.getCustody(id),
    enabled: !!asset && normalizeKindShape(asset?.category?.config).holder.enabled,
  })

  const moneyQ = useQuery({
    queryKey: keys.assets.money(id),
    queryFn: () => assetsApi.getMoney(id),
    // Only when the kind tracks money — otherwise this asks for a ledger that
    // will always be empty on every open.
    enabled: !!asset && normalizeKindShape(asset?.category?.config).money.enabled,
  })

  if (assetQ.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }
  if (!asset) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-center text-muted-foreground">
        {t("assetRecords.notFound", "Not found")}
      </div>
    )
  }

  const kind = asset.category ?? undefined
  const shape = normalizeKindShape(kind?.config)

  // The list this record came from: its type, inside its space's Assets tab.
  // Falls back to the spaces list for an asset whose type was deleted out from
  // under it — an orphan, which has no list to go back to.
  const backHref = kind?.spaceId
    // The kind's own list, on the page that now owns it — carrying `type` so
    // Back lands on the kind you came from rather than the list of kinds.
    ? `/assets?space=${kind.spaceId}&type=${kind.id}`
    : "/locations"

  // getAssetHistory already unwraps the envelope, so this IS the array. Reaching
  // for .data on it "defensively" is what made the tab read empty while the API
  // was returning the job perfectly well.
  const tasks: MaintenanceHistoryItem[] = Array.isArray(tasksQ.data) ? tasksQ.data : []
  const openCount = tasks.filter((tk) => !DONE.includes(tk.status)).length

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/*
        Back goes where the label says, not wherever the browser last was.

        `router.back()` looked equivalent and was not: the space page keeps its
        open tab and open type in the URL, but only a history entry created
        AFTER that was true carries them. Arriving here from a task, a search
        result or a pasted link left Back pointing at something that had nothing
        to do with the word next to the arrow. A button naming a destination has
        to go to that destination every time.
      */}
      <button
        onClick={() => router.push(backHref)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {kind?.name ?? t("assetKinds.title", "Assets")}
      </button>

      {/* Header */}
      <AssetRecordHeader id={id} asset={asset} kind={kind} shape={shape} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* Left: about */}
        <AssetAbout asset={asset} shape={shape} />

        {/* Right: what happened to it */}
        <main className="min-w-0 space-y-4">
          <div className="flex items-center gap-1 border-b border-border/70">
            {([
              ["activity", t("assetRecords.activity", "Activity"), (actQ.data ?? []).length],
              ["history", t("assetRecords.jobs", "Jobs"), openCount || null],
              // The logbook: whenever the kind logs anything at all — Cost counts.
              ...(logTypesForKind(shape).length > 0
                ? [["logbook", t("assetLog.tab", "Logbook"), null] as const]
                : []),
              ...(shape.money.enabled
                ? [
                  [
                    "money",
                    t("assetMoney.title", "Money"),
                    moneyQ.data?.totals?.waitingCount || moneyQ.data?.entries.length || null] as const]
                : []),
              ...(shape.holder.enabled
                ? [["custody", t("custody.tab", "Custody"), (custodyQ.data?.periods ?? []).length || null] as const]
                : []),
              ...shape.lists.map((l) => [`list:${l.label}`, l.label, null] as const),
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {count ? <span className="text-xs text-muted-foreground">{count}</span> : null}
              </button>
            ))}
          </div>

          {tab.startsWith("list:") ? (
            (() => {
              const list = shape.lists.find((l) => `list:${l.label}` === tab)
              // The tab can outlive its list if the kind is edited while the
              // record is open; fall back rather than render nothing at all.
              if (!list) {
                return <p
                  className="py-8 text-center text-sm text-muted-foreground">{t(
                    "assetLists.gone",
                    "That table is no longer on this kind.")}</p>
              }
              // Cards or a grid — a display choice the kind makes, not a type
              // we recognise. Both read the same rows.
              return list.display === "cards"
                ? <AssetFaults assetId={id} assetName={asset.name} spaceId={kind?.spaceId} list={list} shape={shape} />
                : <AssetListTable assetId={id} list={list} />
            })()
          ) : tab === "logbook" ? (
            <LogbookPanel assetId={id} shape={shape} canManage={canManageAssets} />
          ) : tab === "custody" ? (
            <AssetCustodyPanel assetId={id} shape={shape} canManage={canManageAssets} />
          ) : tab === "money" ? (
            <MoneyPanel
              assetId={id}
              shape={shape}
              loading={moneyQ.isLoading}
              entries={moneyQ.data?.entries ?? []}
              totals={moneyQ.data?.totals}
              periods={custodyQ.data?.periods ?? []}
              canManage={canManageAssets}
              onChanged={() => {
                qc.invalidateQueries({ queryKey: keys.assets.money(id) })
                qc.invalidateQueries({ queryKey: keys.assets.expensesPending() })
                qc.invalidateQueries({ queryKey: keys.assets.custody(id) })
                // The same rows feed the logbook's totals.
                qc.invalidateQueries({ queryKey: keys.assets.log(id) })
                qc.invalidateQueries({ queryKey: keys.assets.logSummary(id) })
              }}
            />
          ) : tab === "activity" ? (
            <div className="space-y-3">
              <NoteBox assetId={id} onAdded={() => qc.invalidateQueries({ queryKey: keys.assets.activities(id) })} />
              <Timeline loading={actQ.isLoading} activities={actQ.data ?? []} />
            </div>
          ) : (
            <AssetJobsPanel assetId={id} loading={tasksQ.isLoading} tasks={tasks} />
          )}
        </main>
      </div>
    </div>
  )
}
