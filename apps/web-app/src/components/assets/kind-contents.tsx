"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Package, Plus, Pencil, Search, Trash2, User } from "lucide-react"
import { assetsApi, type AssetCategory, type AssetStatus } from "@/lib/api"
import {
  normalizeKindShape,
  kindHolderLabel,
  detailRowsForKind,
  type KindShape,
  canManageAssetsIn,
  ASSET_STATUS_ORDER,
} from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionHeader, EmptyState } from "../common/section-header"
import { AssetRecordDialog, type AssetRecord } from "@/components/assets/asset-record-dialog"
import { AssetStatusChip, useAssetStatusLabel } from "@/components/assets/asset-status"
import { AssetRetireDialog } from "@/components/assets/asset-retire-dialog"
import { keys } from "@/lib/query-keys"

/**
 * Everything inside one kind — all the apartments, all the vans.
 *
 * The list stays plain on purpose: a name, who has it, where it is. What each
 * one did belongs on its own record.
 */
export function KindContents({
  spaceId, kind, onBack, onChanged,
}: {
  spaceId: string
  kind: AssetCategory
  onBack: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const qc = useQueryClient()
  const { user } = useAuth()
  const shape = normalizeKindShape(kind.config)
  const statusLabel = useAssetStatusLabel()
  const [search, setSearch] = useState("")
  /*
    Which states to list. Retired records are hidden unless asked for: they are
    kept for their history, and a list that leads with the van sold last year
    is a list somebody scrolls past every day. Choosing "Retired" in the filter
    shows them regardless — the filter is the more specific question.
  */
  const [status, setStatus] = useState<AssetStatus | "">("")
  const [showRetired, setShowRetired] = useState(false)
  const [retiring, setRetiring] = useState<{ id: string; name: string; jobs: number } | null>(null)

  const recordsQ = useQuery({
    queryKey: keys.assets.records(kind.id, status, showRetired),
    queryFn: () => assetsApi.getAssets({
      categoryId: kind.id,
      status: status || undefined,
      hideRetired: !status && !showRetired ? "true" : undefined,
      /*
        The server's ceiling, not its default of 20. The search below filters
        what came back, so a default page silently hid every record after the
        twentieth from both the list and the search.
      */
      limit: 200,
    }),
  })

  // The list endpoint has returned both a bare array and a wrapped page, so
  // normalise once rather than guessing at each use.
  const raw = (recordsQ.data as unknown as { data?: unknown })?.data ?? recordsQ.data
  const records: AssetRecord[] = Array.isArray(raw) ? (raw as AssetRecord[]) : []

  // Filtered here rather than on the server: this list is one space's records of
  // one type, already bounded by the page above it.
  const q = search.trim().toLowerCase()
  const shown = q
    ? records.filter((r) =>
        r.name?.toLowerCase().includes(q) ||
        r.locationAddress?.toLowerCase().includes(q) ||
        r.serialNumber?.toLowerCase().includes(q),
      )
    : records

  const refresh = () => {
    // Every filter's cache for this kind — a status change moves a record
    // between them.
    qc.invalidateQueries({ queryKey: keys.assets.records(kind.id) })
    onChanged()
  }

  /*
    Delete, or offer to retire.

    A record with jobs in its history cannot be deleted — its history IS its
    value — and the server says so. The list already knows the count, so it asks
    the question the refusal would have ended on, with the button that answers it.
  */
  const remove = (r: AssetRecord) => {
    const jobs = r._count?.tasks ?? 0
    if (jobs > 0 && r.status !== "RETIRED") {
      setRetiring({ id: r.id, name: r.name, jobs })
      return
    }
    del.mutate(r.id)
  }

  const del = useMutation({
    mutationFn: (id: string) => assetsApi.deleteAsset(id),
    onSuccess: () => { notify.success(t("assetRecords.removed", "Removed")); refresh() },
    onError: (e: Error) => notify.error(e?.message || t("assetRecords.removeFailed", "Could not remove this")),
  })

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className={"inline-flex items-center gap-1.5 text-sm text-muted-foreground " + "transition-colors hover:text-foreground"}>
        <ArrowLeft className="h-4 w-4" /> {t("assetKinds.title", "Assets")}
      </button>

      <SectionHeader
        icon={Package}
        accent="sky"
        title={kind.name}
        description={kind.description || t("assetRecords.intro", "Everything of this kind in this workspace.")}
        action={
          // Adding a record is a write: `canManageAssets` in this workspace.
          canManageAssetsIn(user, spaceId) ? (
            <AssetRecordDialog
              spaceId={spaceId}
              kind={kind}
              onSaved={refresh}
              trigger={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("common.add", "Add")}</Button>}
            />
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(records.length > 3 || search) && (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("assetRecords.search", "Search…")}
              className="h-8 pl-8 text-sm"
            />
          </div>
        )}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AssetStatus | "")}
          aria-label={t("assetFacts.status.label", "Status")}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option value="">{t("assetFacts.filter.all", "All statuses")}</option>
          {ASSET_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
        {/* Only meaningful while no single status is chosen. */}
        {!status && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={(e) => setShowRetired(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            {t("assetFacts.filter.showRetired", "Show retired")}
          </label>
        )}
      </div>

      {recordsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Package}
          title={search || status
            ? t("assetLists.noMatch", "Nothing matches that")
            : t("assetRecords.empty", "Nothing added yet")}
        />
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            // The first two details this TYPE asks for, so a row says something
            // about the thing rather than only its name.
            const facts = detailRowsForKind(shape, r.details).filter((d) => d.value).slice(0, 2)
            return (
              <div
                key={r.id}
                className={"group flex items-center gap-3 rounded-xl border border-border bg-card " +
                  "p-3 transition-colors hover:border-primary/40"}>
                <button
                  onClick={() => router.push(`/assets/${r.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg " +
                      "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"}>
                    <Package className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                        {r.name}
                      </span>
                      <AssetStatusChip status={r.status} />
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[r.locationAddress, ...facts.map((f) => `${f.label} ${f.value}`)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
                {shape.holder.enabled && <HolderBadge record={r} shape={shape} />}
                <AssetRecordDialog
                  spaceId={spaceId}
                  kind={kind}
                  existing={r}
                  onSaved={refresh}
                  trigger={
                    <button
                      className={"rounded p-1 text-muted-foreground opacity-0 transition-opacity " +
                        "hover:text-foreground group-hover:opacity-100"}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  }
                />
                <button
                  onClick={() => remove(r)}
                  aria-label={t("common.remove", "Remove")}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <AssetRetireDialog asset={retiring} onClose={() => setRetiring(null)} onRetired={refresh} />
    </div>
  )
}

/** Who has this one — under whatever the type calls them, and how many. */
function HolderBadge({ record, shape }: { record: AssetRecord; shape: KindShape }) {
  const { t } = useTranslation()
  const label = kindHolderLabel(shape, t("assetRecords.holder", "Held by"))
  // Falls back to the old single columns for a record the list has not
  // refetched yet, so the badge never blinks to "Free" mid-refresh.
  const count = record.holders?.length ?? (record.holderUserId || record.customerId ? 1 : 0)

  if (count > 0) {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <User className="h-3 w-3" /> {label}
        {/* The number only when there is more than one — "Resident 1" reads as
            a name, and every single-holder list would grow a pointless digit. */}
        {count > 1 && <span className="tabular-nums opacity-70">{count}</span>}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="shrink-0 text-muted-foreground">
      {t("assetRecords.free", "Nobody")}
    </Badge>
  )
}
